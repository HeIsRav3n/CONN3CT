// ── Discord slash command registration ───────────────────────
// Run: ts-node src/bot/deploy-commands.ts
// Registers commands globally or to a specific guild (dev mode)

import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { getCommandJSON } from './handlers/commandHandler';
import { createChildLogger } from '../utils/logger';

dotenv.config();
const log = createChildLogger('deploy-commands');

async function deployCommands(): Promise<void> {
  const token = process.env['DISCORD_BOT_TOKEN'];
  const clientId = process.env['DISCORD_CLIENT_ID'];
  const guildId = process.env['DISCORD_GUILD_ID'];

  if (!token || !clientId) {
    throw new Error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
  }

  const commands = getCommandJSON();
  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId) {
    // Dev: guild-scoped (instant update)
    log.info('Registering commands to guild', { guildId, count: commands.length });
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    log.info('Guild commands registered successfully');
  } else {
    // Production: global (up to 1h propagation)
    log.info('Registering global commands', { count: commands.length });
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    log.info('Global commands registered successfully');
  }
}

deployCommands().catch((err) => {
  log.error('Command registration failed', { error: err.message });
  process.exit(1);
});
