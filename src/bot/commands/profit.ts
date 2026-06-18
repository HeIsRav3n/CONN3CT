import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { findWalletsByUserId } from '../../database/repositories/walletRepository';
import { getCollectionPnlForWallet } from '../../database/repositories/profitRepository';
import { getOpenSeaClient } from '../../api/opensea/client';
import { generatePnlImage } from '../../utils/imageGenerator';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { isValidEthAddress } from '../../utils/validators';
import { truncateAddress } from '../../utils/formatters';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('profit-command');

export const profitCommand = {
  data: new SlashCommandBuilder()
    .setName('profit')
    .setDescription('View your P&L card for a specific NFT collection')
    .addStringOption(opt =>
      opt
        .setName('contract')
        .setDescription('Collection contract address (0x...)')
        .setRequired(true),
    )
    .addStringOption(opt =>
      opt
        .setName('wallet')
        .setDescription('Specific wallet to check (optional — uses all your wallets)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const contractRaw = interaction.options.getString('contract', true).trim();
    const walletInput = interaction.options.getString('wallet')?.trim().toLowerCase();

    if (!isValidEthAddress(contractRaw)) {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Invalid Contract Address')
            .setDescription(`\`${contractRaw}\` is not a valid Ethereum address (must start with 0x).`),
        ],
      });
      return;
    }

    const contractAddress = contractRaw.toLowerCase();

    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const wallets = await findWalletsByUserId(user.id);
    if (wallets.length === 0) {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Connect a Wallet First')
            .setDescription(
              'You haven\'t added a wallet yet.\n\n' +
              'Use `/wallet-add address:0x...` to start tracking your NFTs.\n' +
              'After adding, run `/refresh` to sync your trade history.',
            )
            .setFooter({ text: 'CONN3CT PNL' }),
        ],
      });
      return;
    }

    const targetWallets = walletInput
      ? wallets.filter(w => w.address === walletInput)
      : wallets;

    if (targetWallets.length === 0) {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Wallet Not Found')
            .setDescription(
              `\`${walletInput}\` is not in your tracked wallets.\n\n` +
              'Check your wallets with `/wallets`, or add it with `/wallet-add`.',
            ),
        ],
      });
      return;
    }

    // Pre-checks passed — defer ephemerally while we do the heavy lifting
    await interaction.deferReply({ ephemeral: true });

    let combined: Awaited<ReturnType<typeof getCollectionPnlForWallet>> = null;

    for (const wallet of targetWallets) {
      const stats = await getCollectionPnlForWallet(wallet.id, contractAddress);
      if (!stats) continue;

      if (!combined) {
        combined = { ...stats };
      } else {
        combined.spentEth         += stats.spentEth;
        combined.salesEth         += stats.salesEth;
        combined.gasFeeEth        += stats.gasFeeEth;
        combined.mintCount        += stats.mintCount;
        combined.buyCount         += stats.buyCount;
        combined.sellCount        += stats.sellCount;
        combined.heldCount        += stats.heldCount;
        combined.realizedPnlEth   += stats.realizedPnlEth;
        combined.unrealizedPnlEth += stats.unrealizedPnlEth;
      }
    }

    if (!combined) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('No Activity Found')
            .setDescription(
              `No NFT activity found for \`${truncateAddress(contractAddress)}\`.\n\n` +
              'Make sure you\'ve synced your wallet with `/refresh`, then try again.',
            ),
        ],
      });
      return;
    }

    // Fetch live data from OpenSea in parallel with ETH price
    const [ethPriceUsd, liveCollection] = await Promise.all([
      getEthPriceUsd().catch(() => 1800),
      (combined.collectionSlug
        ? getOpenSeaClient().getCollectionStats(combined.collectionSlug)
            .then(s => ({ floorPrice: s.total.floor_price, numOwners: s.total.num_owners }))
            .catch(() => null)
        : getOpenSeaClient().getCollectionByContract(contractAddress)
            .then(c => c ? { floorPrice: c.totalSupply ?? null, numOwners: null } : null)
            .catch(() => null)
      ),
    ]);

    // Live floor price takes priority over cached DB value
    const floorPriceEth = liveCollection?.floorPrice ?? combined.floorPriceEth;
    const holdersCount  = liveCollection?.numOwners  ?? null;

    const holdingValueEth = combined.heldCount * floorPriceEth;
    const totalPnlEth     = combined.realizedPnlEth + combined.unrealizedPnlEth;
    const totalCostEth    = combined.spentEth + combined.gasFeeEth;
    const roiPct          = totalCostEth > 0 ? (totalPnlEth / totalCostEth) * 100 : 0;

    const walletLabel =
      targetWallets.length === 1
        ? truncateAddress(targetWallets[0]!.address)
        : `${targetWallets.length} wallets`;

    const imageBuffer = await generatePnlImage({
      collectionName:    combined.collectionName,
      collectionImageUrl: combined.collectionImageUrl ?? undefined,
      contractAddress:   combined.contractAddress,
      walletLabel,
      totalSupply:       combined.totalSupply,
      holdersCount,
      floorPriceEth,
      spentEth:          combined.spentEth,
      salesEth:          combined.salesEth,
      holdingValueEth,
      gasFeeEth:         combined.gasFeeEth,
      mintCount:         combined.mintCount,
      buyCount:          combined.buyCount,
      sellCount:         combined.sellCount,
      heldCount:         combined.heldCount,
      realizedPnlEth:    combined.realizedPnlEth,
      unrealizedPnlEth:  combined.unrealizedPnlEth,
      totalPnlEth,
      totalPnlUsd:       totalPnlEth * ethPriceUsd,
      roiPct,
      ethPriceUsd,
    });

    log.info('Profit card generated', {
      userId: interaction.user.id,
      contract: contractAddress,
      pnlEth: totalPnlEth,
      roiPct,
      floorPriceEth,
      holdersCount,
    });

    await interaction.deleteReply();
    await interaction.followUp({
      files: [new AttachmentBuilder(imageBuffer, { name: 'conn3ct-profit.png' })],
    });
  },
};
