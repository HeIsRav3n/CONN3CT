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
import { buildPortfolioSummary } from '../../engines/portfolio';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import { getEthPriceUsd } from '../../api/ethereum/client';
import {
  formatEth,
  formatUsd,
  formatPct,
  pnlEmoji,
  pnlColor,
  formatNumber,
  formatDuration,
  truncateAddress,
} from '../../utils/formatters';
import type { PortfolioSummary } from '../../types';

export const portfolioCommand = {
  data: new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('Display your complete NFT portfolio dashboard'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const summary: PortfolioSummary = await withCache(
      CK.portfolioSummary(user.id),
      TTL.PORTFOLIO,
      () => buildPortfolioSummary(user.id, user.discordId, user.username),
    );

    const ethPrice = await getEthPriceUsd();
    const totalPnlEth =
      parseFloat(summary.totalRealizedPnlEth) + parseFloat(summary.totalUnrealizedPnlEth);
    const totalPnlColor = pnlColor(totalPnlEth.toFixed(18));
    const emoji = pnlEmoji(totalPnlEth.toFixed(18));

    const embed = new EmbedBuilder()
      .setColor(totalPnlColor)
      .setTitle(`${emoji} ${summary.username}'s NFT Portfolio`)
      .setDescription(`**${formatNumber(summary.totalHoldings)} NFTs** across **${summary.wallets.length} wallet(s)**`)
      .addFields(
        {
          name: '💼 Portfolio Value',
          value: [
            `${formatEth(summary.totalPortfolioValueEth, 4)}`,
            `≈ ${formatUsd(summary.totalPortfolioValueUsd)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '💰 Total Cost Basis',
          value: formatEth(summary.totalCostBasisEth, 4),
          inline: true,
        },
        {
          name: '⛽ Total Gas Paid',
          value: formatEth(summary.totalGasFeeEth, 4),
          inline: true,
        },
        {
          name: '📈 Realized P&L',
          value: [
            `${pnlEmoji(summary.totalRealizedPnlEth)} **${formatEth(summary.totalRealizedPnlEth, 4)}**`,
            `≈ ${formatUsd(summary.totalRealizedPnlUsd)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📊 Unrealized P&L',
          value: [
            `${pnlEmoji(summary.totalUnrealizedPnlEth)} **${formatEth(summary.totalUnrealizedPnlEth, 4)}**`,
            `≈ ${formatUsd(summary.totalUnrealizedPnlUsd)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🎯 Total ROI',
          value: `**${formatPct(summary.totalRoiPct)}**`,
          inline: true,
        },
        {
          name: '📉 Trade Stats',
          value: [
            `Win Rate: **${formatPct(summary.winRate)}**`,
            `Wins: **${summary.winningTrades}** / Losses: **${summary.losingTrades}**`,
            `Total Trades: **${summary.totalTrades}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🏆 Best / Worst Trade',
          value: [
            `Best: **${formatEth(summary.bestTradeEth, 4)}**`,
            `Worst: **${formatEth(summary.worstTradeEth, 4)}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⏱️ Avg Hold Time',
          value: `**${formatDuration(summary.avgHoldDurationDays)}**`,
          inline: true,
        },
      )
      .setFooter({
        text: `CONN3CT PNL • ETH Price: ${formatUsd(ethPrice)} • Updated ${new Date().toUTCString()}`,
      })
      .setTimestamp();

    // Top 3 collections
    if (summary.collections.length > 0) {
      const top3 = summary.collections.slice(0, 3);
      embed.addFields({
        name: '🎨 Top Collections',
        value: top3
          .map(
            (c, i) =>
              `**${i + 1}. ${c.name}** — ${c.holdingsCount} NFT${c.holdingsCount !== 1 ? 's' : ''} · Floor: ${formatEth(c.floorPriceEth, 4)} · P&L: ${formatEth(c.unrealizedPnlEth, 4)}`,
          )
          .join('\n'),
        inline: false,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('view_holdings')
        .setLabel('View Holdings')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🖼️'),
      new ButtonBuilder()
        .setCustomId('view_pnl')
        .setLabel('P&L Breakdown')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId('view_trades')
        .setLabel('Trade History')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜'),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
