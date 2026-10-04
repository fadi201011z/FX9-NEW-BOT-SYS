import { Events, PermissionFlagsBits } from 'discord.js';
import { getConfig, getSpamData, upsertSpamData } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { logEntry, notice, field, userTag } from '../utils/embeds.js';
import { updateTicketActivity } from '../handlers/inactivityHandler.js';
import { getTicket, getTicketByAdminChannel, getGuildConfig } from '../data/ticketDB.js';
import mongoose from 'mongoose';
import GuildConfig from '../models/GuildConfig.js';
import { getGuildInvite } from '../utils/invite.js';
import { markSelfAction, autoUnbanKey, AUTO_UNBAN_TTL_MS } from '../utils/recentAction.js';

export const name = Events.MessageCreate;
export const once = false;

const OWNER_ID = process.env.OWNER_ID || null;

// ─── Protection thresholds ──────────────────────────────────────────────────
const SPAM_THRESHOLD    = 5;
const SPAM_WINDOW_MS    = 5_000;
const TIMEOUT_MS        = 60_000;
const MENTION_THRESHOLD = 5;
const LINK_REGEX        = /https?:\/\/[^\s]+/gi;

const BAN_DURATION_MS = 24 * 60 * 60 * 1000;

// Cached for 15 seconds: a Mongo query per message is not worth it.
const restrictedCache = new Map();
const RESTRICTED_TTL_MS = 15_000;

async function getRestrictedChannelIds(guildId) {
  const cached = restrictedCache.get(guildId);
  if (cached && Date.now() - cached.at < RESTRICTED_TTL_MS) return cached.ids;

  let ids = [];
  try {
    const doc = await GuildConfig.findOne({ guildId, key: 'restricted_channels' }).lean();
    if (doc?.value) ids = JSON.parse(doc.value).map((c) => c.id);
  } catch { /* database unavailable — treat as none */ }

  restrictedCache.set(guildId, { at: Date.now(), ids });
  return ids;
}

/**
 * Posts a short warning in the channel and removes it after `seconds`.
 * Plain text: it is one sentence that disappears, so an embed would be noise.
 */
async function warnAndCleanUp(channel, text, seconds) {
  const msg = await channel.send({ content: text }).catch(() => null);
  if (msg) setTimeout(() => msg.delete().catch(() => {}), seconds * 1000);
}

export async function execute(message, client) {
  if (!message.guild || message.author.bot) return;

  const { guild, member, channel } = message;

  // ══════════════════════════════════════════════════════════════════════════
  //  RESTRICTED CHANNELS
  //  Anyone who posts here is banned for a day — including moderators.
  //  Exempt: the owner, the bot, and dashboard admins.
  // ══════════════════════════════════════════════════════════════════════════

  const restrictedIds = await getRestrictedChannelIds(guild.id);

  if (restrictedIds.includes(channel.id)) {
    let exempt = Boolean(OWNER_ID) && message.author.id === OWNER_ID;

    if (!exempt) {
      try {
        const adminDoc = await mongoose.connection.db.collection('admins').findOne({
          userId: message.author.id,
          guildId: guild.id,
          role: 'admin',
        });
        if (adminDoc) exempt = true;
      } catch { /* database unavailable — no exemption */ }
    }
    if (exempt) return;

    const { author } = message;
    const userId  = author.id;
    const guildId = guild.id;

    await message.delete().catch(() => {});

    // Clear their recent messages in this channel.
    try {
      const msgs = await channel.messages.fetch({ limit: 50 });
      const theirs = msgs.filter((m) => m.author.id === userId);
      if (theirs.size > 0) await channel.bulkDelete(theirs).catch(() => {});
    } catch { /* cannot bulk delete here */ }

    // Fetched before the ban: once they are banned the bot no longer shares a
    // guild with them, and every DM fails.
    const inviteLink = await getGuildInvite(guild);
    const ownerMention = guild.ownerId ? `<@${guild.ownerId}>` : 'the server owner';

    // ── DM first, while the bot can still reach them ────────────────────────
    let dmSent = false;
    try {
      const description = [
        `**Server:** ${guild.name}`,
        `**Reason:** you posted in ${channel} (${channel.name}), which is restricted.`,
        '',
        'This action was taken automatically to protect the server.',
        'Your account may have been compromised, or you may have posted in the',
        'wrong channel by mistake.',
        '',
        '**⏰ Ban duration: 24 hours**',
        'The ban lifts itself when the timer runs out.',
      ];

      if (inviteLink) {
        description.push('');
        description.push(`**🔗 Rejoin link once unbanned:** ${inviteLink}`);
      }

      description.push('');
      description.push(`If you think this is a mistake, contact ${ownerMention}.`);

      await author.send({
        embeds: [notice({
          title: '🚫 You have been banned',
          description: description.join('\n'),
          color: 0x7f1d1d,
          footer: 'Kratos System • Automatic protection',
          timestamp: true,
        })],
      });
      dmSent = true;
    } catch (err) {
      console.error(`[Restricted] Could not DM ${userId}:`, err?.message ?? err);
    }

    // ── Ban ─────────────────────────────────────────────────────────────────
    let banned = false;
    try {
      await guild.members.ban(userId, {
        reason: 'Posted in a restricted channel — automatic 24-hour ban',
        deleteMessageSeconds: 86400,
      });
      banned = true;
    } catch {
      // Usually a missing permission, a higher role, or the server owner.
      // The user has already read "you have been banned", so correct the
      // record rather than leave them believing it worked.
      await author.send({
        embeds: [notice({
          title: '⚠️ The ban could not be applied',
          description: [
            `**Server:** ${guild.name}`,
            '',
            'The automatic ban did not go through — most often the bot lacks the '
            + '**Ban Members** permission, or your highest role outranks the bot’s.',
            '',
            `If you need help, contact ${ownerMention}.`,
          ].join('\n'),
          color: 0xf59e0b,
          footer: 'Kratos System • Automatic protection',
          timestamp: true,
        })],
      }).catch(() => {});
    }

    // ── Auto-unban ─────────────────────────────────────────────────────────
    if (banned) {
      const key = autoUnbanKey(guildId, userId);

      setTimeout(async () => {
        // Registered *before* the unban so GUILD_BAN_REMOVE recognises it, and
        // deliberately left in place afterwards: that event arrives over the
        // gateway a moment after this REST call resolves, and on a different
        // connection, so clearing the marker immediately meant the event almost
        // always missed it — logging a phantom "a staff member lifted your ban"
        // and sending the member a second, contradicting DM.
        markSelfAction(key, AUTO_UNBAN_TTL_MS);
        try {
          await guild.members.unban(userId, 'Automatic 24-hour ban expired');
        } catch {
          return;
        }

        try {
          const user = await client.users.fetch(userId);
          await user.send({
            embeds: [notice({
              title: '✅ Your ban has been lifted',
              description: [
                `**Server:** ${guild.name}`,
                'The 24-hour automatic ban has expired.',
                '',
                inviteLink
                  ? `You can rejoin here:\n${inviteLink}`
                  : 'You can rejoin now.',
                '',
                'Sorry for the inconvenience, and thanks for understanding.',
              ].join('\n'),
              color: 0x22c55e,
              footer: 'Kratos System • Automatic protection',
              timestamp: true,
            })],
          }).catch(() => {});
        } catch { /* account unavailable */ }
      }, BAN_DURATION_MS);
    }

    // ── Modlog ─────────────────────────────────────────────────────────────
    try {
      const [logDoc, modLogDoc] = await Promise.all([
        GuildConfig.findOne({ guildId: guild.id, key: 'log_channel' }).lean(),
        GuildConfig.findOne({ guildId: guild.id, key: 'modlog_channel' }).lean(),
      ]);

      const alertChId = modLogDoc?.value || logDoc?.value;
      if (alertChId) {
        const alertCh = await guild.channels.fetch(alertChId).catch(() => null);

        if (alertCh) {
          const fields = [
            field('💬 Channel', channel.toString()),
            field('📋 Action', banned ? '🔨 Banned for 24 hours' : '🧹 Messages deleted only'),
            field('✉️ DM status', dmSent
              ? '✅ Delivered'
              : '⚠️ Could not be sent — DMs closed or the account is unavailable'),
            field('📝 Message', `\`\`\`\n${(message.content || '[no text]').slice(0, 990)}\n\`\`\``, false),
          ];

          if (message.attachments.size > 0) {
            fields.push(field('📎 Attachments', message.attachments
              .map((a) => `[${a.name}](${a.url})`)
              .join('\n')
              .slice(0, 1024), false));
          }

          await alertCh.send({
            embeds: [logEntry({
              kind: 'restricted_channel',
              target: `${author} (${userTag(author)})`,
              fields,
              footer: 'Kratos System • Restricted channels',
            })],
          }).catch(() => {});
        }
      }
    } catch { /* logging must never block moderation */ }

    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TICKET RELAY
  // ══════════════════════════════════════════════════════════════════════════

  if (message.content || message.attachments.size > 0) {
    // Member channel → staff channel.
    const userTicket = getTicket(channel.id);
    if (userTicket && userTicket.status !== 'closed' && userTicket.adminChannelId) {
      updateTicketActivity(channel.id);
      try {
        const adminCh = await guild.channels.fetch(userTicket.adminChannelId).catch(() => null);
        if (adminCh) await adminCh.send(formatUserRelay(message));
      } catch { /* cannot reach the staff channel */ }
      return;
    }

    // Staff channel → member channel.
    const adminTicket = getTicketByAdminChannel(channel.id);
    if (adminTicket && adminTicket.status !== 'closed') {
      const config = getGuildConfig(guild.id);
      try {
        const author = await guild.members.fetch(message.author.id).catch(() => null);
        if (!author) return;

        const isSupport = author.permissions.has(PermissionFlagsBits.Administrator)
          || author.permissions.has(PermissionFlagsBits.ManageChannels)
          || (config.supportRoleIds ?? []).some((id) => author.roles.cache.has(id));

        if (!isSupport) return;

        const userCh = await guild.channels.fetch(adminTicket.channelId).catch(() => null);
        if (userCh) {
          await userCh.send(await formatAdminRelay(message, guild));
          updateTicketActivity(adminTicket.channelId);
        }
      } catch { /* cannot reach the member channel */ }
      return;
    }

    // Single-channel tickets only need their timer refreshed.
    if (userTicket && userTicket.status !== 'closed') {
      updateTicketActivity(channel.id);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ANTI-SPAM / ANTI-LINK / ANTI-MENTION
  // ══════════════════════════════════════════════════════════════════════════

  const guildId  = guild.id;
  const userId   = message.author.id;
  const now      = Date.now();
  const logCh    = await getLogChannel(guild, getConfig(guildId, 'log_channel'));
  const modLogCh = await getLogChannel(guild, getConfig(guildId, 'modlog_channel'));
  const alertCh  = modLogCh ?? logCh;

  // The owner is the only exemption — moderators are held to the same rule, by
  // design. Earlier versions exempted any staff role.
  if (member && member.id === guild.ownerId) return;

  // ─── Anti-mention ────────────────────────────────────────────────────────
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MENTION_THRESHOLD) {
    await message.delete().catch(() => {});

    await warnAndCleanUp(
      channel,
      `⚠️ ${message.author} — you cannot mention ${mentionCount} people in one message.`,
      6,
    );

    if (alertCh) {
      await alertCh.send({
        embeds: [logEntry({
          kind: 'automod_mentions',
          target: `${message.author} (${userTag(message.author)})`,
          fields: [
            field('💬 Channel', channel.toString()),
            field('📊 Mentions', `${mentionCount}`),
          ],
          footer: 'Kratos System • Modlog',
        })],
      }).catch(() => {});
    }
    return;
  }

  // ─── Anti-link ───────────────────────────────────────────────────────────
  const links = message.content.match(LINK_REGEX) ?? [];
  if (links.length > 0) {
    await message.delete().catch(() => {});

    await warnAndCleanUp(
      channel,
      `⚠️ ${message.author} — links are not allowed in this server.`,
      5,
    );

    if (alertCh) {
      await alertCh.send({
        embeds: [logEntry({
          kind: 'automod_links',
          target: `${message.author} (${userTag(message.author)})`,
          fields: [
            field('💬 Channel', channel.toString()),
            field('🔗 Link', links[0].slice(0, 1024), false),
          ],
          footer: 'Kratos System • Modlog',
        })],
      }).catch(() => {});
    }
    return;
  }

  // ─── Anti-spam ───────────────────────────────────────────────────────────
  const spamData = await getSpamData(guildId, userId);
  let count = 1;
  let lastReset = now;

  if (spamData && now - spamData.lastReset < SPAM_WINDOW_MS) {
    count = spamData.messageCount + 1;
    lastReset = spamData.lastReset;
  }
  await upsertSpamData(guildId, userId, count, lastReset);

  if (count >= SPAM_THRESHOLD) {
    await upsertSpamData(guildId, userId, 0, now);

    let timedOut = false;
    try {
      await member.timeout(TIMEOUT_MS, 'Auto-mod: spam');
      timedOut = true;
    } catch { /* the bot cannot time out this member */ }

    await warnAndCleanUp(
      channel,
      `⚠️ ${message.author} — ${timedOut
        ? `you have been timed out for ${TIMEOUT_MS / 1000} seconds.`
        : 'please stop sending repeated messages.'}`,
      8,
    );

    if (alertCh) {
      await alertCh.send({
        embeds: [logEntry({
          kind: 'automod_spam',
          target: `${message.author} (${userTag(message.author)})`,
          fields: [
            field('💬 Channel', channel.toString()),
            field('📊 Messages', `${count} in ${SPAM_WINDOW_MS / 1000}s`),
            field('⚡ Action', timedOut
              ? `🔇 Timed out for ${TIMEOUT_MS / 1000}s`
              : '⚠️ Warning only'),
          ],
          footer: 'Kratos System • Modlog',
        })],
      }).catch(() => {});
    }
  }
}

// ── Ticket relay helpers ───────────────────────────────────────────────────

function formatUserRelay(msg) {
  const parts = [`📩 **${msg.author.username}:** ${msg.content || ''}`];
  for (const attachment of msg.attachments.values()) parts.push(attachment.url);
  return parts.join('\n');
}

async function formatAdminRelay(msg, guild) {
  let roleDisplay = '[STAFF] ';

  try {
    const member = await guild.members.fetch(msg.author.id).catch(() => null);
    const highest = member?.roles.highest;
    if (highest && highest.name !== '@everyone') roleDisplay = `[${highest.name}] `;
  } catch { /* fall back to the generic STAFF label */ }

  const parts = [`📨 **${roleDisplay}${msg.author.username}:** ${msg.content || ''}`];
  for (const attachment of msg.attachments.values()) parts.push(attachment.url);
  return parts.join('\n');
}