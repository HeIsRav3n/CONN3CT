import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { findWalletsByUserId } from '../../database/repositories/walletRepository';
import { getPnlSummaryForUser } from '../../database/repositories/pnlRepository';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import { calcRoiPct, calcWinRate } from '../../utils/math';
import { generatePnlCard } from '../../utils/imageGenerator';

export const pnlCommand = {
  data: new SlashCommandBuilder()
    .setName('pnl')
    .setDescription('View your complete NFT profit & loss card'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // ── Defer immediately — Discord requires a response within 3s ─
    await interaction.deferReply({ ephemeral: true });

    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const wallets = await findWalletsByUserId(user.id);
    if (wallets.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Connect a Wallet First')
            .setDescription(
              'You haven\'t added a wallet yet.\n\n' +
              'Use `/wallet-add address:0x...` to start tracking your NFTs.',
            )
            .setFooter({ text: 'CONN3CT PNL' }),
        ],
      });
      return;
    }

    const [ethPriceUsd, summary] = await Promise.all([
      getEthPriceUsd().catch(() => 1800),
      withCache(CK.pnlSummary(user.id), TTL.PNL_SUMMARY, () => getPnlSummaryForUser(user.id)),
    ]);

    const totalPnlEth = summary.totalRealizedPnlEth + summary.totalUnrealizedPnlEth;
    const roiPct = parseFloat(calcRoiPct(totalPnlEth.toFixed(18), summary.totalCostBasisEth.toFixed(18)));
    const winRate = parseFloat(calcWinRate(summary.winningTrades, summary.totalTrades));

    const buf = await generatePnlCard({
      username: user.username,
      realizedPnlEth: summary.totalRealizedPnlEth,
      unrealizedPnlEth: summary.totalUnrealizedPnlEth,
      totalPnlEth,
      totalPnlUsd: totalPnlEth * ethPriceUsd,
      costBasisEth: summary.totalCostBasisEth,
      roiPct,
      winRate,
      totalTrades: summary.totalTrades,
      wins: summary.winningTrades,
      losses: summary.losingTrades,
      bestTradeEth: summary.bestTradeEth,
      worstTradeEth: summary.worstTradeEth,
      avgHoldDays: summary.avgHoldDays,
      ethPriceUsd,
    });

    // Remove the ephemeral "thinking" message, post the image publicly
    await interaction.deleteReply();
    await interaction.followUp({
      files: [new AttachmentBuilder(buf, { name: 'conn3ct-pnl.png' })],
    });
  },
};
