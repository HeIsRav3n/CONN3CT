import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { findWalletsByUserId } from '../../database/repositories/walletRepository';
import { getCollectionPnlForWallet } from '../../database/repositories/profitRepository';
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
    await interaction.deferReply();

    const contractRaw = interaction.options.getString('contract', true).trim();
    const walletInput = interaction.options.getString('wallet')?.trim().toLowerCase();

    if (!isValidEthAddress(contractRaw)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Invalid Contract Address')
            .setDescription(`\`${contractRaw}\` is not a valid Ethereum address.`),
        ],
      });
      return;
    }

    const contractAddress = contractRaw.toLowerCase();
    const wallets = await findWalletsByUserId(interaction.user.id);

    if (wallets.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('No Wallets')
            .setDescription('Add a wallet first with `/wallet add`.'),
        ],
      });
      return;
    }

    const targetWallets = walletInput
      ? wallets.filter(w => w.address === walletInput)
      : wallets;

    if (targetWallets.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('Wallet Not Tracked')
            .setDescription(`\`${walletInput}\` is not in your tracked wallets. Use \`/wallet add\` first.`),
        ],
      });
      return;
    }

    // Aggregate across all target wallets
    let combined: Awaited<ReturnType<typeof getCollectionPnlForWallet>> = null;

    for (const wallet of targetWallets) {
      const stats = await getCollectionPnlForWallet(wallet.id, contractAddress);
      if (!stats) continue;

      if (!combined) {
        combined = { ...stats };
      } else {
        combined.spentEth += stats.spentEth;
        combined.salesEth += stats.salesEth;
        combined.gasFeeEth += stats.gasFeeEth;
        combined.mintCount += stats.mintCount;
        combined.buyCount += stats.buyCount;
        combined.sellCount += stats.sellCount;
        combined.heldCount += stats.heldCount;
        combined.realizedPnlEth += stats.realizedPnlEth;
        combined.unrealizedPnlEth += stats.unrealizedPnlEth;
      }
    }

    if (!combined) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('No Data Found')
            .setDescription(
              `No activity found for \`${truncateAddress(contractAddress)}\`.\n` +
              `Sync your wallet first with \`/refresh\`, then try again.`,
            ),
        ],
      });
      return;
    }

    const ethPriceUsd = await getEthPriceUsd().catch(() => 1800);
    const holdingValueEth = combined.heldCount * combined.floorPriceEth;
    const totalPnlEth = combined.realizedPnlEth + combined.unrealizedPnlEth;
    const totalCostEth = combined.spentEth + combined.gasFeeEth;
    const roiPct = totalCostEth > 0 ? (totalPnlEth / totalCostEth) * 100 : 0;

    const walletLabel =
      targetWallets.length === 1
        ? truncateAddress(targetWallets[0]!.address)
        : `${targetWallets.length} wallets`;

    const imageBuffer = await generatePnlImage({
      collectionName: combined.collectionName,
      collectionImageUrl: combined.collectionImageUrl ?? undefined,
      contractAddress: combined.contractAddress,
      walletLabel,
      spentEth: combined.spentEth,
      salesEth: combined.salesEth,
      holdingValueEth,
      gasFeeEth: combined.gasFeeEth,
      mintCount: combined.mintCount,
      buyCount: combined.buyCount,
      sellCount: combined.sellCount,
      heldCount: combined.heldCount,
      realizedPnlEth: combined.realizedPnlEth,
      unrealizedPnlEth: combined.unrealizedPnlEth,
      totalPnlEth,
      totalPnlUsd: totalPnlEth * ethPriceUsd,
      roiPct,
      ethPriceUsd,
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'conn3ct-pnl.png' });
    await interaction.editReply({ files: [attachment] });

    log.info('Profit card generated', {
      userId: interaction.user.id,
      contract: contractAddress,
      pnlEth: totalPnlEth,
      roiPct,
    });
  },
};
