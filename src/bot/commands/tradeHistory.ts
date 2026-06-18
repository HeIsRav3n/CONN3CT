import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  SelectMenuBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  Colors,
} from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { getTradeHistory } from '../../database/repositories/transactionRepository';
import { getEthPriceUsd } from '../../api/ethereum/client';
import {
  formatEth,
  formatUsd,
  formatPct,
  pnlEmoji,
  formatDate,
  formatDuration,
} from '../../utils/formatters';
import { ethToUsd } from '../../utils/math';

const PAGE_SIZE = 5;

export const tradeHistoryCommand = {
  data: new SlashCommandBuilder()
    .setName('trade-history')
    .setDescription('View your paginated NFT trade history')
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Page number').setRequired(false).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt
        .setName('sort')
        .setDescription('Sort trades by')
        .setRequired(false)
        .addChoices(
          { name: 'Date (Newest)', value: 'date_desc' },
          { name: 'Date (Oldest)', value: 'date_asc' },
          { name: 'P&L (Best First)', value: 'pnl_desc' },
          { name: 'P&L (Worst First)', value: 'pnl_asc' },
          { name: 'ROI (Best First)', value: 'roi_desc' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const page = interaction.options.getInteger('page') ?? 1;
    const sortRaw = interaction.options.getString('sort') ?? 'date_desc';
    const [sortBy, sortDir] = sortRaw.split('_') as ['date' | 'pnl' | 'roi', 'asc' | 'desc'];

    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const ethPrice = await getEthPriceUsd();
    const { records, total } = await getTradeHistory(user.id, {
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
    });

    if (total === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('📜 No Trade History')
            .setDescription('No closed trades found yet. Trades appear after you sell an NFT.'),
        ],
      });
      return;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const safePage = Math.max(1, Math.min(page, totalPages));

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📜 ${user.username}'s Trade History`)
      .setDescription(`**${total} closed trade${total !== 1 ? 's' : ''}** • Page ${safePage}/${totalPages}`)
      .setFooter({ text: `CONN3CT PNL • ETH: ${formatUsd(ethPrice)}` })
      .setTimestamp();

    for (const record of records) {
      const nft = (record as any).nft;
      const collection = nft?.collection;
      const nftName = nft?.name ?? `#${nft?.tokenId ?? '?'}`;
      const pnlEth = record.realizedPnlEth?.toString() ?? '0';
      const pnlUsd = ethToUsd(pnlEth, ethPrice);

      embed.addFields({
        name: `${pnlEmoji(pnlEth)} ${nftName} — ${collection?.name ?? 'Unknown'}`,
        value: [
          `Buy: **${formatEth(record.costBasisEth.toString(), 4)}** | Sell: **${formatEth(record.salePriceEth?.toString() ?? '0', 4)}**`,
          `Gas: ${formatEth(record.buyGasFeeEth.toString(), 5)} buy + ${formatEth(record.sellGasFeeEth?.toString() ?? '0', 5)} sell`,
          `Fees: Marketplace ${formatEth(record.marketplaceFeeEth?.toString() ?? '0', 5)} + Royalty ${formatEth(record.royaltyFeeEth?.toString() ?? '0', 5)}`,
          `Net P&L: **${formatEth(pnlEth, 4)}** (${formatPct(record.roiPct?.toString() ?? '0')}) ≈ ${formatUsd(pnlUsd)}`,
          `Hold Time: **${formatDuration(record.holdDurationDays ?? 0)}**`,
          record.soldAt ? `Sold: ${formatDate(record.soldAt)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`trades_prev_${safePage - 1}_${sortRaw}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 1),
      new ButtonBuilder()
        .setCustomId(`trades_next_${safePage + 1}_${sortRaw}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
