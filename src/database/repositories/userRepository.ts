import { User, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export async function upsertUser(
  discordId: string,
  username: string,
  discriminator?: string,
  avatarUrl?: string,
  guildId?: string,
): Promise<User> {
  return prisma.user.upsert({
    where: { discordId },
    create: { discordId, username, discriminator, avatarUrl, guildId, lastSeenAt: new Date() },
    update: { username, discriminator, avatarUrl, guildId, lastSeenAt: new Date(), updatedAt: new Date() },
  });
}

export async function findUserByDiscordId(discordId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { discordId } });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserWithWallets(discordId: string) {
  return prisma.user.findUnique({
    where: { discordId },
    include: { wallets: { where: { status: { not: 'INACTIVE' } } } },
  });
}

export async function deactivateUser(id: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { isActive: false } });
}
