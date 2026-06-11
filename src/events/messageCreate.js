import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getConfig, getSpamData, upsertSpamData } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';
import { updateTicketActivity } from '../handlers/inactivityHandler.js';
import { getTicket, getTicketByAdminChannel, getGuildConfig } from '../data/ticketDB.js';

export const name = Events.MessageCreate;
export const once = false;

// ─── SYS protection settings ────────────────────────────────────────────────
const SPAM_THRESHOLD    = 5;
const SPAM_WINDOW_MS    = 5_000;
const TIMEOUT_MS        = 60_000;
const MENTION_THRESHOLD = 5;
const LINK_REGEX        = /https?:\/\/[^\s]+/gi;
const ALLOWED_DOMAINS   = ['discord.com', 'discord.gg'];

export async function execute(message) {
  if (!message.guild || message.author.bot) return;

  const { guild, member, channel } = message;

  // ══════════════════════════════════════════════════════════════════════════
  //  TICKET: Relay system (forward between user/admin channels)
  // ══════════════════════════════════════════════════════════════════════════

  if (message.content || message.attachments.size > 0) {

    // Message from user channel → forward to admin channel
    const userTicket = getTicket(channel.id);
    if (userTicket && userTicket.status !== 'closed' && userTicket.adminChannelId) {
      updateTicketActivity(channel.id);
      try {
        const adminCh = await guild.channels.fetch(userTicket.adminChannelId).catch(() => null);
        if (adminCh) {
          await adminCh.send(formatUserRelay(message));
        }
      } catch {}
      return;
    }

    // Message from admin channel → forward to user channel
    const adminTicket = getTicketByAdminChannel(channel.id);
    if (adminTicket && adminTicket.status !== 'closed') {
      const config = getGuildConfig(guild.id);
      try {
        const m = await guild.members.fetch(message.author.id).catch(() => null);
        if (!m) return;

        const isSupport =
          m.permissions.has(8n) ||
          m.permissions.has(16n) ||
          config.supportRoleIds.some((id) => m.roles.cache.has(id));

        if (!isSupport) return;

        const userCh = await guild.channels.fetch(adminTicket.channelId).catch(() => null);
        if (userCh) {
          const text = await formatAdminRelay(message, guild, message.client);
          await userCh.send(text);
          updateTicketActivity(adminTicket.channelId);
        }
      } catch {}
      return;
    }

    // Update activity for single-channel tickets
    if (userTicket && userTicket.status !== 'closed') {
      updateTicketActivity(channel.id);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SYS: Anti-spam / Anti-link / Anti-mention protection
  //  (skip for members with ManageMessages permission)
  // ══════════════════════════════════════════════════════════════════════════

  if (member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const guildId  = guild.id;
  const userId   = message.author.id;
  const now      = Date.now();
  const logCh    = await getLogChannel(guild, getConfig(guildId, 'log_channel'));
  const modLogCh = await getLogChannel(guild, getConfig(guildId, 'modlog_channel'));
  const alertCh  = modLogCh ?? logCh;

  // ─── Anti-Mention-Spam ────────────────────────────────────────────────
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MENTION_THRESHOLD) {
    await message.delete().catch(() => {});

    const warn = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.BLOOD)
          .setTitle('🚫 مسح جماعي للمنشنات')
          .setDescription(`${message.author} — لا يُسمح بمنشنة ${mentionCount} عضو في رسالة واحدة.`)
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  الحماية التلقائية' })
      ],
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);

    if (alertCh) {
      await alertCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.BLOOD)
            .setTitle('🚨 Auto-Mod — منشنات جماعية')
            .addFields(
              { name: '👤 المستخدم', value: `${message.author} \`${message.author.tag}\``, inline: true },
              { name: '💬 القناة',   value: `${channel}`,                                 inline: true },
              { name: '📊 المنشنات', value: `${mentionCount} منشن`,                       inline: true },
            )
            .setTimestamp()
            .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
        ],
      }).catch(() => {});
    }
    return;
  }

  // ─── Anti-Link ────────────────────────────────────────────────────────
  const links = message.content.match(LINK_REGEX) ?? [];
  if (links.length > 0) {
    const hasDisallowed = links.some(link => {
      try {
        const host = new URL(link).hostname;
        return !ALLOWED_DOMAINS.some(d => host === d || host.endsWith('.' + d));
      } catch { return true; }
    });

    if (hasDisallowed) {
      await message.delete().catch(() => {});

      const warn = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.WARNING)
            .setTitle('🔗 رابط محظور')
            .setDescription(`${message.author} — الروابط غير مسموح بها في هذا السيرفر.`)
            .setTimestamp()
            .setFooter({ text: '⚔️ FX9-SYS  •  الحماية التلقائية' })
        ],
      }).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);

      if (alertCh) {
        await alertCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.WARNING)
              .setTitle('🔗 Auto-Mod — رابط محذوف')
              .addFields(
                { name: '👤 المستخدم', value: `${message.author} \`${message.author.tag}\``, inline: true },
                { name: '💬 القناة',   value: `${channel}`,                                 inline: true },
                { name: '🔗 الرابط',   value: links[0].slice(0, 512),                       inline: false },
              )
              .setTimestamp()
              .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
          ],
        }).catch(() => {});
      }
      return;
    }
  }

  // ─── Anti-Spam ────────────────────────────────────────────────────────
  const spamData  = getSpamData(guildId, userId);
  let count       = 1;
  let lastReset   = now;

  if (spamData && now - spamData.last_reset < SPAM_WINDOW_MS) {
    count     = spamData.message_count + 1;
    lastReset = spamData.last_reset;
  }
  upsertSpamData(guildId, userId, count, lastReset);

  if (count >= SPAM_THRESHOLD) {
    upsertSpamData(guildId, userId, 0, now);

    let timedOut = false;
    try {
      await member.timeout(TIMEOUT_MS, 'Auto-Mod: سبام');
      timedOut = true;
    } catch { /* no permission */ }

    const warn = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.ERROR)
          .setTitle('🚫 سبام مكتشف')
          .setDescription(
            `${message.author} — ` +
            (timedOut ? `تم إيقافك مؤقتاً لمدة **${TIMEOUT_MS / 1000} ثانية**.` : 'يُرجى التوقف عن الإرسال المتكرر.')
          )
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  الحماية التلقائية' })
      ],
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);

    if (alertCh) {
      await alertCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.ERROR)
            .setTitle('🤖 Auto-Mod — سبام')
            .addFields(
              { name: '👤 المستخدم', value: `${message.author} \`${message.author.tag}\``,   inline: true },
              { name: '💬 القناة',   value: `${channel}`,                                    inline: true },
              { name: '📊 الرسائل',  value: `${count} في ${SPAM_WINDOW_MS / 1000}ث`,        inline: true },
              { name: '⚡ الإجراء',  value: timedOut ? `إيقاف ${TIMEOUT_MS / 1000}ث` : 'تحذير', inline: true },
            )
            .setTimestamp()
            .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
        ],
      }).catch(() => {});
    }
  }
}

// ── TICKET relay helpers ─────────────────────────────────────────────────────

function formatUserRelay(msg) {
  const parts = [];
  parts.push(`📩 **${msg.author.username}:** ${msg.content || ''}`);
  if (msg.attachments.size > 0) {
    for (const att of msg.attachments.values()) {
      parts.push(att.url);
    }
  }
  return parts.join('\n');
}

async function formatAdminRelay(msg, guild, client) {
  const parts = [];

  let roleDisplay = '';
  try {
    const member = await guild.members.fetch(msg.author.id).catch(() => null);
    if (member) {
      const config = getGuildConfig(guild.id);
      const supportRoleId = config.supportRoleIds.find((id) => member.roles.cache.has(id));
      if (supportRoleId) {
        const roleName = member.roles.cache.get(supportRoleId)?.name;
        roleDisplay = `[${roleName}] `;
      } else {
        const highestRole = member.roles.highest;
        if (highestRole && highestRole.name !== '@everyone') {
          roleDisplay = `[${highestRole.name}] `;
        } else {
          roleDisplay = '[STAFF] ';
        }
      }
    }
  } catch {}

  parts.push(`📨 **${roleDisplay}${msg.author.username}:** ${msg.content || ''}`);
  if (msg.attachments.size > 0) {
    for (const att of msg.attachments.values()) {
      parts.push(att.url);
    }
  }
  return parts.join('\n');
}
