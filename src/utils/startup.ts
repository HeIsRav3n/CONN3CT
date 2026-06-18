// ── Startup validation — fail fast on missing critical env vars ─
import { createChildLogger } from './logger';

const log = createChildLogger('startup');

const REQUIRED_ENV: { key: string; hint: string }[] = [
  { key: 'DISCORD_BOT_TOKEN', hint: 'Get from discord.com/developers/applications → Bot tab' },
  { key: 'DISCORD_CLIENT_ID', hint: 'Get from discord.com/developers/applications → General Information' },
  { key: 'DATABASE_URL', hint: 'PostgreSQL connection string: postgresql://user:pass@host:5432/db' },
  { key: 'ALCHEMY_API_KEY', hint: 'Get from dashboard.alchemy.com' },
  { key: 'OPENSEA_API_KEY', hint: 'Get from docs.opensea.io' },
  { key: 'ETHEREUM_RPC_URL', hint: 'Alchemy or Infura HTTP endpoint' },
  { key: 'API_SECRET_KEY', hint: 'Any random 32+ character secret string' },
  { key: 'ENCRYPTION_KEY', hint: '64-character hex string (32 bytes)' },
  { key: 'JWT_SECRET', hint: 'Any random secret for JWT signing' },
];

export function validateEnvironment(): void {
  const missing: string[] = [];

  for (const { key, hint } of REQUIRED_ENV) {
    if (!process.env[key]) {
      missing.push(`  ${key}\n    → ${hint}`);
    }
  }

  if (missing.length > 0) {
    log.error(
      `\n\n❌ Missing required environment variables:\n\n${missing.join('\n\n')}\n\n` +
      `Copy .env.example to .env and fill in the values.\n`,
    );
    process.exit(1);
  }

  log.info('Environment validation passed', { checks: REQUIRED_ENV.length });
}
