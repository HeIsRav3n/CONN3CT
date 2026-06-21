import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { prisma } from '../../database/prisma';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import {
  formatEth,
  formatUsd,
  formatPct,
  pnlEmoji,
  pnlColor,
  formatNumber,
} from '../../utils/formatters';
import { ethToUsd, calcRoiPct } from '../../utils/math';

export const collectionCommand = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('Analyze your performance for a specific NFT collection')
    .addStringOption((opt) =>
      opt.setName('slug').setDescription('OpenSea collection slug (e.g. boredapeyachtclub)').setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const slug = interaction.options.getString('slug', true).toLowerCase().trim();
    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const ethPrice = await getEthPriceUsd();

    const summary = await withCache(
      CK.collectionSummary(user.id, slug),
      TTL.COLLECTION_SUMMARY,
      async () => {
        const collection = await prisma.collection.findUnique({ where: { slug } });
        if (!collection) return null;

        const [holdingsAgg, pnlRealized, pnlUnrealized] = await Promise.all([
          prisma.holding.aggregate({
            where: {
              wallet: { userId: user.id },
              nft: { collectionId: collection.id },
            },
            _count: { id: true },
            _sum: { costBasisEth: true, gasFeeEth: true },
          }),
          prisma.pnlRecord.aggregate({
            where: {
              userId: user.id,
              isRealized: true,
              nft: { collectionId: collection.id },
            },
            _sum: { realizedPnlEth: true, salePriceEth: true },
            _count: { id: true },
            _max: { realizedPnlEth: true },
            _min: { realizedPnlEth: true },
          }),
          prisma.pnlRecord.aggregate({
            where: {
              userId: user.id,
              isRealized: false,
              nft: { collectionId: collection.id },
            },
            _sum: { unrealizedPnlEth: true },
          }),
        ]);

        const wins = await prisma.pnlRecord.count({
          where: {
            userId: user.id,
            isRealized: true,
            realizedPnlEth: { gt: 0 },
            nft: { collectionId: collection.id },
          },
        });

        return { collection, holdingsAgg, pnlRealized, pnlUnrealized, wins };
      },
    );

    if (!summary) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Collection Not Found')
            .setDescription(`No data found for collection \`${slug}\`. Ensure you have traded NFTs in this collection.`),
        ],
      });
      return;
    }

    const { collection, holdingsAgg, pnlRealized, pnlUnrealized, wins } = summary;
    const holdingsCount = holdingsAgg._count.id;
    const costBasisEth = parseFloat(holdingsAgg._sum.costBasisEth?.toString() ?? '0');
    const gasFeeEth = parseFloat(holdingsAgg._sum.gasFeeEth?.toString() ?? '0');
    const totalCostEth = (costBasisEth + gasFeeEth).toFixed(18);
    const realizedPnlEth = parseFloat(pnlRealized._sum.realizedPnlEth?.toString() ?? '0');
    const unrealizedPnlEth = parseFloat(pnlUnrealized._sum.unrealizedPnlEth?.toString() ?? '0');
    const totalPnl = realizedPnlEth + unrealizedPnlEth;
    const roiPct = calcRoiPct(totalPnl.toFixed(18), totalCostEth);
    const totalTrades = pnlRealized._count.id;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : '0';
    const volume = parseFloat(pnlRealized._sum.salePriceEth?.toString() ?? '0').toFixed(18);

    const embed = new EmbedBuilder()
      .setColor(pnlColor(totalPnl.toFixed(18)))
      .setTitle(`🎨 ${collection.name}`)
      .setDescription(`Your performance in **${collection.name}** ([\`${slug}\`](https://opensea.io/collection/${slug}))`)
      .addFields(
        {
          name: '🖼️ Current Holdings',
          value: `**${holdingsCount} NFT${holdingsCount !== 1 ? 's' : ''}**`,
          inline: true,
        },
        {
          name: '🏷️ Floor Price',
          value: `**${formatEth(collection.floorPriceEth?.toString() ?? '0', 4)}**`,
          inline: true,
        },
        {
          name: '💰 Total Cost Basis',
          value: formatEth(totalCostEth, 4),
          inline: true,
        },
        {
          name: '📈 Realized P&L',
          value: `${pnlEmoji(realizedPnlEth.toFixed(18))} **${formatEth(realizedPnlEth.toFixed(18), 4)}**\n≈ ${formatUsd(ethToUsd(realizedPnlEth.toFixed(18), ethPrice))}`,
          inline: true,
        },
        {
          name: '📊 Unrealized P&L',
          value: `${pnlEmoji(unrealizedPnlEth.toFixed(18))} **${formatEth(unrealizedPnlEth.toFixed(18), 4)}**\n≈ ${formatUsd(ethToUsd(unrealizedPnlEth.toFixed(18), ethPrice))}`,
          inline: true,
        },
        {
          name: '🎯 ROI',
          value: `**${formatPct(roiPct)}**`,
          inline: true,
        },
        {
          name: '📊 Trade Summary',
          value: [
            `Closed Trades: **${totalTrades}**`,
            `Win Rate: **${formatPct(winRate)}**`,
            `Volume: **${formatEth(volume, 4)}**`,
            `Best Trade: **${formatEth(pnlRealized._max.realizedPnlEth?.toString() ?? '0', 4)}**`,
            `Worst Trade: **${formatEth(pnlRealized._min.realizedPnlEth?.toString() ?? '0', 4)}**`,
          ].join('\n'),
          inline: false,
        },
      )
      .setTimestamp();

    if (collection.imageUrl) embed.setThumbnail(collection.imageUrl);
    if (collection.bannerUrl) embed.setImage(collection.bannerUrl);

    await interaction.editReply({ embeds: [embed] });
  },
};
