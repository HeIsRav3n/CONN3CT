import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { buildHoldingDetails } from '../../engines/portfolio';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import {
  formatEth,
  formatUsd,
  formatPct,
  pnlEmoji,
  pnlColor,
  formatDuration,
} from '../../utils/formatters';
import type { HoldingDetail } from '../../types';

const PAGE_SIZE = 5;

export const holdingsCommand = {
  data: new SlashCommandBuilder()
    .setName('holdings')
    .setDescription('Display your current NFT holdings with unrealized P&L')
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number').setRequired(false).setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const page = interaction.options.getInteger('page') ?? 1;
    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const ethPrice = await getEthPriceUsd();
    const allHoldings = await buildHoldingDetails(user.id, ethPrice);

    if (allHoldings.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🖼️ No Current Holdings')
            .setDescription("You don't hold any NFTs currently. Check your trade history with `/trade-history`."),
        ],
      });
      return;
    }

    await sendHoldingsPage(interaction, allHoldings, page, ethPrice, user.username);
  },
};

export async function sendHoldingsPage(
  interaction: ChatInputCommandInteraction,
  holdings: HoldingDetail[],
  page: number,
  ethPrice: number,
  username: string,
): Promise<void> {
  const totalPages = Math.ceil(holdings.length / PAGE_SIZE);
  const safePage = Math.max(1, Math.min(page, totalPages));
  const slice = holdings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalValue = holdings.reduce((s, h) => s + parseFloat(h.currentValueEth), 0);
  const totalCost = holdings.reduce((s, h) => s + parseFloat(h.totalCostEth), 0);
  const totalUnrealized = holdings.reduce((s, h) => s + parseFloat(h.unrealizedPnlEth), 0);

  const embed = new EmbedBuilder()
    .setColor(pnlColor(totalUnrealized.toFixed(18)))
    .setTitle(`🖼️ ${username}'s Holdings (${holdings.length} NFTs)`)
    .setDescription(
      [
        `Portfolio Value: **${formatEth(totalValue.toFixed(18), 4)}** ≈ ${formatUsd((totalValue * ethPrice).toFixed(2))}`,
        `Total Cost: **${formatEth(totalCost.toFixed(18), 4)}** | Unrealized P&L: **${formatEth(totalUnrealized.toFixed(18), 4)}**`,
      ].join('\n'),
    )
    .setFooter({ text: `Page ${safePage}/${totalPages} • CONN3CT PNL` })
    .setTimestamp();

  for (const h of slice) {
    embed.addFields({
      name: `${pnlEmoji(h.unrealizedPnlEth)} ${h.name ?? `${h.collectionName} #${h.tokenId}`}`,
      value: [
        `Collection: **${h.collectionName}**`,
        `Floor: ${formatEth(h.floorPriceEth, 4)} | Cost: ${formatEth(h.totalCostEth, 4)}`,
        `Unrealized P&L: **${formatEth(h.unrealizedPnlEth, 4)}** (${formatPct(h.roiPct)})`,
        `≈ ${formatUsd(h.unrealizedPnlUsd)} USD`,
        `Hold Duration: **${formatDuration(h.holdDurationDays)}**`,
      ].join('\n'),
      inline: false,
    });

    if (h.imageUrl) embed.setThumbnail(h.imageUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`holdings_prev_${safePage - 1}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`holdings_next_${safePage + 1}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages),
    new ButtonBuilder()
      .setCustomId('sort_by_pnl')
      .setLabel('Sort by P&L')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}
