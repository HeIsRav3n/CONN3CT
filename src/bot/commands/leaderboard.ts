import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { upsertUser, findUserById } from '../../database/repositories/userRepository';
import { getLeaderboard } from '../../database/repositories/pnlRepository';
import { getEthPriceUsd } from '../../api/ethereum/client';
import { withCache } from '../../cache/redis';
import { CK, TTL } from '../../cache/cacheKeys';
import { formatEth, formatUsd, formatPct, pnlEmoji, truncateAddress } from '../../utils/formatters';
import { ethToUsd } from '../../utils/math';

const RANK_EMOJI = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Server-wide NFT P&L leaderboard')
    .addStringOption((opt) =>
      opt
        .setName('metric')
        .setDescription('Rank by metric')
        .setRequired(false)
        .addChoices(
          { name: 'Total Profit (ETH)', value: 'profit' },
          { name: 'ROI %', value: 'roi' },
          { name: 'Volume Traded', value: 'volume' },
          { name: 'Win Rate', value: 'winrate' },
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const metric = interaction.options.getString('metric') ?? 'profit';
    await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId,
    );

    const ethPrice = await getEthPriceUsd();
    const entries = await withCache(
      CK.leaderboard(interaction.guildId),
      TTL.LEADERBOARD,
      () => getLeaderboard(interaction.guildId!, 10),
    );

    if (entries.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🏆 Leaderboard Empty')
            .setDescription('No trading data yet. Start tracking wallets with `/wallet-add`!'),
        ],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 CONN3CT PNL Leaderboard')
      .setDescription(`Ranked by **${metric === 'profit' ? 'Total Realized Profit' : metric === 'roi' ? 'ROI %' : metric === 'volume' ? 'Volume' : 'Win Rate'}**`)
      .setFooter({ text: `CONN3CT PNL • ETH: ${formatUsd(ethPrice)}` })
      .setTimestamp();

    const lines: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const rank = RANK_EMOJI[i] ?? `#${i + 1}`;
      const user = await findUserById(entry.userId);
      const username = user?.username ?? 'Unknown Trader';
      const pnlEth = entry.totalRealizedPnlEth.toFixed(18);
      const pnlUsd = ethToUsd(pnlEth, ethPrice);

      lines.push(
        `${rank} **${username}** — ${pnlEmoji(pnlEth)} ${formatEth(pnlEth, 4)} (≈ ${formatUsd(pnlUsd)}) · ${entry.totalTrades} trade${entry.totalTrades !== 1 ? 's' : ''}`,
      );
    }

    embed.setDescription(
      `Ranked by Total Realized P&L\n\n${lines.join('\n')}`,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
