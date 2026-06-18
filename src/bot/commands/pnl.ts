import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { getPnlSummaryForUser } from '../../database/repositories/pnlRepository';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import {
  formatEth,
  formatUsd,
  formatPct,
  pnlEmoji,
  pnlColor,
  progressBar,
} from '../../utils/formatters';
import { ethToUsd, calcRoiPct, calcWinRate } from '../../utils/math';

export const pnlCommand = {
  data: new SlashCommandBuilder()
    .setName('pnl')
    .setDescription('View your complete NFT profit & loss breakdown'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const ethPrice = await getEthPriceUsd();
    const summary = await withCache(
      CK.pnlSummary(user.id),
      TTL.PNL_SUMMARY,
      () => getPnlSummaryForUser(user.id),
    );

    const {
      totalRealizedPnlEth,
      totalUnrealizedPnlEth,
      totalCostBasisEth,
      winningTrades,
      losingTrades,
      totalTrades,
      bestTradeEth,
      worstTradeEth,
      avgHoldDays,
    } = summary;

    const combinedPnl = totalRealizedPnlEth + totalUnrealizedPnlEth;
    const roiPct = parseFloat(calcRoiPct(combinedPnl.toFixed(18), totalCostBasisEth.toFixed(18)));
    const winRate = parseFloat(calcWinRate(winningTrades, totalTrades));
    const embedColor = pnlColor(combinedPnl.toFixed(18));

    const realizedUsd = ethToUsd(totalRealizedPnlEth.toFixed(18), ethPrice);
    const unrealizedUsd = ethToUsd(totalUnrealizedPnlEth.toFixed(18), ethPrice);
    const combinedUsd = ethToUsd(combinedPnl.toFixed(18), ethPrice);
    const costUsd = ethToUsd(totalCostBasisEth.toFixed(18), ethPrice);

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(`${pnlEmoji(combinedPnl.toFixed(18))} ${user.username}'s P&L Report`)
      .addFields(
        {
          name: '📈 Realized P&L',
          value: [
            `**${formatEth(totalRealizedPnlEth.toFixed(18), 4)}**`,
            `≈ ${formatUsd(realizedUsd)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📊 Unrealized P&L',
          value: [
            `**${formatEth(totalUnrealizedPnlEth.toFixed(18), 4)}**`,
            `≈ ${formatUsd(unrealizedUsd)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '💰 Combined P&L',
          value: [
            `**${formatEth(combinedPnl.toFixed(18), 4)}**`,
            `≈ ${formatUsd(combinedUsd)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '💼 Total Cost Basis',
          value: `${formatEth(totalCostBasisEth.toFixed(18), 4)}\n≈ ${formatUsd(costUsd)}`,
          inline: true,
        },
        {
          name: '🎯 Overall ROI',
          value: `**${formatPct(roiPct)}**`,
          inline: true,
        },
        {
          name: '🏆 Win Rate',
          value: [
            `**${formatPct(winRate)}**`,
            `${progressBar(winRate)}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '📊 Trade Breakdown',
          value: [
            `Total Closed Trades: **${totalTrades}**`,
            `✅ Profitable: **${winningTrades}**`,
            `❌ Loss-making: **${losingTrades}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⚡ Performance',
          value: [
            `Best Trade: **${formatEth(bestTradeEth.toFixed(18), 4)}**`,
            `Worst Trade: **${formatEth(worstTradeEth.toFixed(18), 4)}**`,
            `Avg Hold: **${avgHoldDays}d**`,
          ].join('\n'),
          inline: true,
        },
      )
      .setFooter({ text: `CONN3CT PNL • ETH: ${formatUsd(ethPrice)}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
