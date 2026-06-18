import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { upsertUser } from '../../database/repositories/userRepository';
import { buildPortfolioSummary } from '../../engines/portfolio';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { generatePortfolioCard } from '../../utils/imageGenerator';

export const portfolioCommand = {
  data: new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('View your complete NFT portfolio dashboard card'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const [ethPriceUsd, summary] = await Promise.all([
      getEthPriceUsd().catch(() => 1800),
      withCache(CK.portfolioSummary(user.id), TTL.PORTFOLIO, () =>
        buildPortfolioSummary(user.id, user.discordId, user.username),
      ),
    ]);

    const totalPnlEth =
      parseFloat(summary.totalRealizedPnlEth) + parseFloat(summary.totalUnrealizedPnlEth);

    const buf = await generatePortfolioCard({
      username: user.username,
      walletCount: summary.wallets.length,
      totalHoldings: summary.totalHoldings,
      portfolioValueEth: parseFloat(summary.totalPortfolioValueEth),
      portfolioValueUsd: parseFloat(summary.totalPortfolioValueUsd),
      costBasisEth: parseFloat(summary.totalCostBasisEth),
      gasFeeEth: parseFloat(summary.totalGasFeeEth),
      realizedPnlEth: parseFloat(summary.totalRealizedPnlEth),
      unrealizedPnlEth: parseFloat(summary.totalUnrealizedPnlEth),
      totalPnlEth,
      totalPnlUsd: totalPnlEth * ethPriceUsd,
      roiPct: parseFloat(summary.totalRoiPct),
      winRate: parseFloat(summary.winRate),
      wins: summary.winningTrades,
      losses: summary.losingTrades,
      totalTrades: summary.totalTrades,
      bestTradeEth: parseFloat(summary.bestTradeEth),
      topCollections: summary.collections.slice(0, 3).map(c => ({
        name: c.name,
        holdings: c.holdingsCount,
        pnlEth: parseFloat(c.unrealizedPnlEth),
      })),
      ethPriceUsd,
    });

    await interaction.editReply({
      files: [new AttachmentBuilder(buf, { name: 'conn3ct-portfolio.png' })],
    });
  },
};
