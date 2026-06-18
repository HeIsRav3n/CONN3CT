import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { upsertUser, getUserWithWallets } from '../../database/repositories/userRepository';
import {
  createWallet,
  findWalletByAddress,
  deactivateWallet,
  findWalletsByUserId,
} from '../../database/repositories/walletRepository';
import { isValidEthAddress, normalizeAddress } from '../../utils/validators';
import { formatTimestamp, truncateAddress } from '../../utils/formatters';
import { enqueueSyncJob } from '../../workers/queues';
import { createChildLogger } from '../../utils/logger';
import { prisma } from '../../database/prisma';

const log = createChildLogger('cmd:wallet');

// ── /wallet-add ───────────────────────────────────────────────
export const walletAddCommand = {
  data: new SlashCommandBuilder()
    .setName('wallet-add')
    .setDescription('Connect an Ethereum wallet for NFT P&L tracking')
    .addStringOption((opt) =>
      opt
        .setName('address')
        .setDescription('Your Ethereum wallet address (0x...)')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('label')
        .setDescription('Optional label for this wallet (e.g. "Main", "Trading")')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const rawAddress = interaction.options.getString('address', true).trim();
    const label = interaction.options.getString('label') ?? undefined;

    if (!isValidEthAddress(rawAddress)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Invalid Address')
            .setDescription('Please provide a valid Ethereum address starting with `0x`.'),
        ],
      });
      return;
    }

    const address = normalizeAddress(rawAddress);

    // Check if already tracked by someone
    const existing = await findWalletByAddress(address);
    if (existing) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('⚠️ Wallet Already Tracked')
            .setDescription(`\`${truncateAddress(address)}\` is already connected to an account.`),
        ],
      });
      return;
    }

    // Check wallet limit (max 5 per user)
    const user = await upsertUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.discriminator,
      interaction.user.displayAvatarURL(),
      interaction.guildId ?? undefined,
    );

    const existingWallets = await findWalletsByUserId(user.id);
    if (existingWallets.length >= 5) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Wallet Limit Reached')
            .setDescription('You can track a maximum of **5 wallets**. Remove one with `/wallet-remove` first.'),
        ],
      });
      return;
    }

    // Create wallet and sync job
    const wallet = await createWallet(user.id, address, label);
    const syncJob = await prisma.syncJob.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        jobType: 'FULL_HISTORY',
        status: 'PENDING',
      },
    });

    await enqueueSyncJob({
      userId: user.id,
      walletId: wallet.id,
      walletAddress: address,
      jobType: 'FULL_HISTORY',
      syncJobId: syncJob.id,
    });

    log.info('Wallet added', { userId: user.id, address, label });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('✅ Wallet Connected')
          .setDescription(`\`${truncateAddress(address)}\` has been added to your portfolio.`)
          .addFields(
            { name: 'Label', value: label ?? 'None', inline: true },
            { name: 'Status', value: '🔄 Historical sync queued...', inline: true },
            { name: 'Full Address', value: `\`${address}\``, inline: false },
          )
          .setFooter({ text: 'CONN3CT PNL • Historical sync may take a few minutes' })
          .setTimestamp(),
      ],
    });
  },
};

// ── /wallet-remove ────────────────────────────────────────────
export const walletRemoveCommand = {
  data: new SlashCommandBuilder()
    .setName('wallet-remove')
    .setDescription('Remove a tracked wallet from your portfolio')
    .addStringOption((opt) =>
      opt
        .setName('address')
        .setDescription('Wallet address to remove')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const rawAddress = interaction.options.getString('address', true).trim();
    if (!isValidEthAddress(rawAddress)) {
      await interaction.editReply('❌ Invalid Ethereum address.');
      return;
    }

    const address = normalizeAddress(rawAddress);
    const wallet = await findWalletByAddress(address);

    if (!wallet) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Wallet Not Found')
            .setDescription(`\`${truncateAddress(address)}\` is not tracked.`),
        ],
      });
      return;
    }

    // Verify ownership
    const user = await upsertUser(interaction.user.id, interaction.user.username);
    if (wallet.userId !== user.id) {
      await interaction.editReply('❌ You can only remove your own wallets.');
      return;
    }

    await deactivateWallet(wallet.id);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Orange)
          .setTitle('🗑️ Wallet Removed')
          .setDescription(`\`${truncateAddress(address)}\` has been removed from your portfolio.\nHistorical data has been preserved.`)
          .setTimestamp(),
      ],
    });
  },
};

// ── /wallets ──────────────────────────────────────────────────
export const walletsCommand = {
  data: new SlashCommandBuilder()
    .setName('wallets')
    .setDescription('Show all your connected wallets and sync status'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const user = await getUserWithWallets(interaction.user.id);
    if (!user || user.wallets.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('👛 No Wallets Connected')
            .setDescription('Add your first wallet with `/wallet-add <address>`'),
        ],
      });
      return;
    }

    const statusEmoji: Record<string, string> = {
      SYNCED: '✅',
      SYNCING: '🔄',
      PENDING: '⏳',
      ERROR: '❌',
      INACTIVE: '💤',
    };

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('👛 Connected Wallets')
      .setDescription(`You have **${user.wallets.length}** wallet(s) connected.`)
      .setTimestamp();

    for (const wallet of user.wallets) {
      const status = statusEmoji[wallet.status] ?? '❓';
      const lastSync = wallet.lastSyncAt ? formatTimestamp(wallet.lastSyncAt) : 'Never';
      embed.addFields({
        name: `${status} ${wallet.label ?? truncateAddress(wallet.address)}`,
        value: [
          `\`${wallet.address}\``,
          `Status: **${wallet.status}**`,
          `Last Sync: ${lastSync}`,
          `NFTs: **${wallet.totalNfts}**`,
          wallet.syncError ? `⚠️ Error: ${wallet.syncError.slice(0, 80)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

// ── /refresh ──────────────────────────────────────────────────
export const refreshCommand = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Force a re-sync of your wallet data')
    .addStringOption((opt) =>
      opt
        .setName('address')
        .setDescription('Specific wallet to refresh (leave empty for all)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const user = await getUserWithWallets(interaction.user.id);
    if (!user) {
      await interaction.editReply('No wallets found. Use `/wallet-add` first.');
      return;
    }

    const rawAddress = interaction.options.getString('address');
    const wallets = rawAddress
      ? user.wallets.filter((w) => w.address === normalizeAddress(rawAddress))
      : user.wallets;

    if (wallets.length === 0) {
      await interaction.editReply('❌ Wallet not found in your portfolio.');
      return;
    }

    for (const wallet of wallets) {
      const syncJob = await prisma.syncJob.create({
        data: { userId: user.id, walletId: wallet.id, jobType: 'INCREMENTAL', status: 'PENDING' },
      });
      await enqueueSyncJob({
        userId: user.id,
        walletId: wallet.id,
        walletAddress: wallet.address,
        jobType: 'INCREMENTAL',
        syncJobId: syncJob.id,
      });
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle('🔄 Sync Queued')
          .setDescription(`Queued sync for **${wallets.length}** wallet(s). Results update in a few minutes.`)
          .setTimestamp(),
      ],
    });
  },
};
