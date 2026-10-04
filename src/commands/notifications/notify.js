import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import {
  getSubscriptions, addSubscription, removeSubscription,
} from '../../data/notificationDB.js';
import { getGuildConfig } from '../../data/ticketDB.js';
import { C, EPHEMERAL, fail, field, notice } from '../../utils/embeds.js';

const PLATFORM_EMOJI = { youtube: '📹', kick: '🔴', twitter: '🐦' };
const PLATFORM_LABEL = {
  youtube: '📹 YouTube',
  kick: '🔴 Kick',
  twitter: '🐦 Twitter/X',
};

async function resolveChannelId(platform, url) {
  if (platform === 'youtube') {
    const { resolveYouTubeChannelId } = await import('../../handlers/notificationMonitor.js');
    return resolveYouTubeChannelId(url);
  }
  if (platform === 'kick') {
    const m = url.match(/kick\.com\/([\w-]+)/i);
    return m ? m[1] : url.trim().replace(/^@/, '');
  }
  if (platform === 'twitter') {
    const m = url.match(/(?:twitter\.com|x\.com)\/(\w+)/i);
    return m ? m[1] : url.trim().replace(/^@/, '');
  }
  return url;
}

export const data = new SlashCommandBuilder()
  .setName('notify')
  .setDescription('🔔 Manage notification subscriptions (YouTube / Kick / Twitter)')
  .addSubcommand((sub) => sub
    .setName('add')
    .setDescription('Add a notification subscription')
    .addStringOption((opt) => opt
      .setName('platform')
      .setDescription('Platform')
      .setRequired(true)
      .addChoices(
        { name: '📹 YouTube', value: 'youtube' },
        { name: '🔴 Kick', value: 'kick' },
        { name: '🐦 Twitter/X', value: 'twitter' },
      ))
    .addStringOption((opt) => opt
      .setName('url')
      .setDescription('Channel URL')
      .setRequired(true))
    .addChannelOption((opt) => opt
      .setName('channel')
      .setDescription('Where the notifications are delivered')
      .setRequired(true))
    .addStringOption((opt) => opt
      .setName('message')
      .setDescription('Extra line shown with every notification (optional)')
      .setRequired(false)))
  .addSubcommand((sub) => sub
    .setName('remove')
    .setDescription('Remove a subscription')
    .addStringOption((opt) => opt
      .setName('id')
      .setDescription('Subscription ID')
      .setRequired(true)))
  .addSubcommand((sub) => sub
    .setName('list')
    .setDescription('List every subscription in this server'));

export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply(fail('This command only works inside a server.'));
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    || (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id));

  if (!isAdmin) {
    await interaction.reply(fail('You need the Manage Channels permission or the support role.'));
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const platform       = interaction.options.getString('platform');
    const url            = interaction.options.getString('url').trim();
    const discordCh      = interaction.options.getChannel('channel');
    const customMessage  = interaction.options.getString('message') || '';

    const resolvedId = await resolveChannelId(platform, url);
    if (!resolvedId) {
      await interaction.editReply({
        content: '❌ Could not read a channel ID from that link — check the URL and try again.',
      });
      return;
    }

    const existing = getSubscriptions(interaction.guildId);
    const dup = existing.find((s) => s.platform === platform && s.channelId === resolvedId);
    if (dup) {
      await interaction.editReply({ content: `⚠️ Already subscribed (ID: \`${dup._id}\`).` });
      return;
    }

    let doc;
    try {
      doc = await addSubscription({
        guildId: interaction.guildId,
        platform,
        channelUrl: url,
        channelId: resolvedId,
        discordChannelId: discordCh.id,
        customMessage,
      });
    } catch (err) {
      console.error('[Notify] Add error:', err);
      await interaction.editReply({ content: '❌ Something went wrong while saving the subscription.' });
      return;
    }

    // The subscription is live — show it, then report the result of the
    // immediate first check in place of the same message.
    await interaction.editReply({
      embeds: [notice({
        title: '✅ Subscription added',
        color: C.ok,
        fields: [
          field('Channel URL', url, false),
          field('Platform', PLATFORM_LABEL[platform] ?? platform),
          field('Delivered to', `<#${discordCh.id}>`),
          field('Subscription ID', `\`${doc._id}\``, false),
          ...(customMessage ? [field('Extra line', customMessage, false)] : []),
        ],
        footer: 'Kratos System • Checking latest content…',
      })],
    });

    try {
      const { checkSubscriptionNow } = await import('../../handlers/notificationMonitor.js');
      const result = await checkSubscriptionNow(interaction.client, doc);

      await interaction.editReply({
        content: result
          ? `✅ Added. A notification was sent for the latest ${result}.`
          : '✅ Added. Nothing new right now — the bot will keep watching.',
      });
    } catch {
      // The subscription is already saved, so a failed first check is not fatal.
    }
    return;
  }

  if (sub === 'remove') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const id = interaction.options.getString('id').trim();
    const subItem = getSubscriptions(interaction.guildId).find((s) => s._id.toString() === id);

    if (!subItem) {
      await interaction.editReply({ content: `❌ No subscription with the ID \`${id}\`.` });
      return;
    }

    await removeSubscription(id);
    await interaction.editReply({ content: `✅ Removed \`${id}\` (${subItem.platform}).` });
    return;
  }

  if (sub === 'list') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const subs = getSubscriptions(interaction.guildId);
    if (subs.length === 0) {
      await interaction.editReply({ content: '📭 No subscriptions in this server.' });
      return;
    }

    // A table: name, destination, id — worth an embed, it gets re-read.
    await interaction.editReply({
      embeds: [notice({
        title: `🔔 Subscriptions (${subs.length})`,
        color: C.info,
        fields: subs.map((s, i) => field(
          `${PLATFORM_EMOJI[s.platform] ?? '•'} ${s.channelName || s.channelId}`,
          `Sent to <#${s.discordChannelId}>\n\`${s._id}\``,
          false,
        )),
        footer: 'Kratos System • /notify list',
      })],
    });
  }
}