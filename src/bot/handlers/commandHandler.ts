import {
  Client,
  Collection,
  ChatInputCommandInteraction,
  Events,
  Interaction,
  ButtonInteraction,
  Colors,
  EmbedBuilder,
} from 'discord.js';
import { walletAddCommand, walletRemoveCommand, walletsCommand, refreshCommand } from '../commands/wallet';
import { portfolioCommand } from '../commands/portfolio';
import { holdingsCommand } from '../commands/holdings';
import { pnlCommand } from '../commands/pnl';
import { tradeHistoryCommand } from '../commands/tradeHistory';
import { leaderboardCommand } from '../commands/leaderboard';
import { collectionCommand } from '../commands/collection';
import { profitCommand } from '../commands/profit';
import { createChildLogger } from '../../utils/logger';
import { upsertUser } from '../../database/repositories/userRepository';

const log = createChildLogger('command-handler');

// ── Per-user command rate limiter ─────────────────────────────
// Prevents spam: max 5 commands per user per 10 seconds
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

// Prune stale entries every 60s to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(userId);
  }
}, 60_000).unref();

interface BotCommand {
  data: { name: string; toJSON?: () => object };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, BotCommand>();

const allCommands: BotCommand[] = [
  walletAddCommand,
  walletRemoveCommand,
  walletsCommand,
  refreshCommand,
  portfolioCommand,
  holdingsCommand,
  pnlCommand,
  tradeHistoryCommand,
  leaderboardCommand,
  collectionCommand,
  profitCommand,
];

for (const cmd of allCommands) {
  commands.set(cmd.data.name, cmd);
}

export function getCommandJSON(): object[] {
  return allCommands.map((cmd) =>
    'toJSON' in cmd.data ? (cmd.data as any).toJSON() : cmd.data,
  );
}

export function registerCommandHandler(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // ── Slash commands ────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;

      // Upsert user in the background — do NOT await here.
      // Awaiting this before execute() delays deferReply past Discord's 3s window.
      // Commands upsert again when they need the DB user record.
      upsertUser(
        interaction.user.id,
        interaction.user.username,
        interaction.user.discriminator,
        interaction.user.displayAvatarURL(),
        interaction.guildId ?? undefined,
      ).catch((err: Error) =>
        log.warn('Background upsert failed', { error: err.message }),
      );

      // Per-user rate limit check
      if (!checkRateLimit(interaction.user.id)) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('⏱️ Slow Down')
              .setDescription(`You're sending commands too fast. Please wait a moment.`),
          ],
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      try {
        log.info('Executing command', { command: interaction.commandName, userId: interaction.user.id });
        await command.execute(interaction);
      } catch (err: any) {
        log.error('Command execution failed', {
          command: interaction.commandName,
          userId: interaction.user.id,
          error: err.message,
          stack: err.stack,
        });

        const errorEmbed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle('❌ Something Went Wrong')
          .setDescription('An error occurred while processing your request. Please try again.')
          .setTimestamp();

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
        }
      }
    }

    // ── Button interactions ───────────────────────────────────
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction as ButtonInteraction);
    }
  });

  log.info('Command handler registered', { commandCount: commands.size });
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  // Portfolio quick-nav buttons
  if (customId === 'view_holdings') {
    await interaction.reply({
      content: 'Use `/holdings` to see your current NFT holdings.',
      ephemeral: true,
    });
    return;
  }
  if (customId === 'view_pnl') {
    await interaction.reply({ content: 'Use `/pnl` for your P&L breakdown.', ephemeral: true });
    return;
  }
  if (customId === 'view_trades') {
    await interaction.reply({ content: 'Use `/trade-history` for paginated trade history.', ephemeral: true });
    return;
  }

  // Holdings pagination
  if (customId.startsWith('holdings_prev_') || customId.startsWith('holdings_next_')) {
    const [, , pageStr] = customId.split('_');
    const page = parseInt(pageStr ?? '1', 10);
    await interaction.reply({
      content: `Use \`/holdings page:${page}\` to navigate pages.`,
      ephemeral: true,
    });
    return;
  }

  // Trade history pagination
  if (customId.startsWith('trades_prev_') || customId.startsWith('trades_next_')) {
    const parts = customId.split('_');
    const page = parseInt(parts[2] ?? '1', 10);
    const sort = parts[3] ?? 'date_desc';
    await interaction.reply({
      content: `Use \`/trade-history page:${page} sort:${sort}\` to navigate.`,
      ephemeral: true,
    });
    return;
  }

  log.debug('Unhandled button interaction', { customId });
}
