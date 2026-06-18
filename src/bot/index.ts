import { Client, GatewayIntentBits, Events, ActivityType } from 'discord.js';
import { getConfig } from '../utils/config';
import { createChildLogger } from '../utils/logger';
import { registerCommandHandler } from './handlers/commandHandler';

const log = createChildLogger('discord-bot');

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
    presence: {
      activities: [{ name: 'NFT P&L | /portfolio', type: ActivityType.Watching }],
      status: 'online',
    },
  });

  client.on(Events.ClientReady, (c) => {
    log.info(`Discord bot ready as ${c.user.tag}`, { guilds: c.guilds.cache.size });
  });

  client.on(Events.Error, (err) => {
    log.error('Discord client error', { error: err.message });
  });

  client.on(Events.GuildCreate, (guild) => {
    log.info('Joined new guild', { guildId: guild.id, guildName: guild.name });
  });

  registerCommandHandler(client);

  return client;
}

export async function startDiscordBot(): Promise<Client> {
  const cfg = getConfig();
  const client = createDiscordClient();
  await client.login(cfg.discord.botToken);
  return client;
}
