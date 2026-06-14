import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getConfig, getSpamData, upsertSpamData } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';
import { updateTicketActivity } from '../handlers/inactivityHandler.js';
import { getTicket, getTicketByAdminChannel, getGuildConfig } from '../data/ticketDB.js';
import mongoose from 'mongoose';
import GuildConfig from '../models/GuildConfig.js';

export const name = Events.MessageCreate;
export const once = false;

const OWNER_ID = process.env.OWNER_ID || null;

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
  //  RESTRICTED CHANNELS — الرومات المحضورة
  //  أي شخص يرسل هنا (حتى الإدارة) يُحظر لمدة يوم
  //  الاستثناءات: المالك, البوت, والمبرمج (role: admin في لوحة التحكم)
  // ══════════════════════════════════════════════════════════════════════════

  let restrictedRaw;
  try { restrictedRaw = await GuildConfig.findOne({ guildId: guild.id, key: 'restricted_channels' }).lean(); } catch {}
  if (restrictedRaw?.value) {
    let restrictedIds = [];
    try { restrictedIds = JSON.parse(restrictedRaw.value).map(c => c.id); } catch {}

    if (restrictedIds.includes(channel.id)) {
      // Exemptions check
      let exempt = false;
      if (OWNER_ID && message.author.id === OWNER_ID) exempt = true;
      if (!exempt) {
        try {
          const adminDoc = await mongoose.connection.db.collection('admins').findOne({
            userId: message.author.id,
            guildId: guild.id,
            role: 'admin',
          });
          if (adminDoc) exempt = true;
        } catch {}
      }
      if (exempt) return;

      // Delete the triggering message immediately
      await message.delete().catch(() => {});

      // Delete user's recent messages in this channel (fast cleanup)
      try {
        const msgs = await channel.messages.fetch({ limit: 50 });
        const userMsgs = msgs.filter(m => m.author.id === message.author.id);
        if (userMsgs.size > 0) await channel.bulkDelete(userMsgs).catch(() => {});
      } catch {}

      // Ban user for 1 day
      let banned = false;
      try {
        await guild.members.ban(message.author.id, {
          reason: 'كتابة في روم محضور — حظر تلقائي لمدة يوم',
          deleteMessageSeconds: 86400,
        });
        banned = true;
      } catch {}

      // Auto unban after 1 day
      if (banned) {
        setTimeout(async () => {
          try { await guild.members.unban(message.author.id, 'انتهت مدة الحظر التلقائي (روم محضور)'); } catch {}
        }, 24 * 60 * 60 * 1000);
      }

      // Send DM to user
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(Colors.BLOOD)
          .setTitle('🚫 تم حظرك من السيرفر')
          .setDescription([
            `**السيرفر:** ${guild.name}`,
            `**السبب:** كتابتك في روم محضور (${channel.name})`,
            '',
            '> هذا الإجراء تلقائي لحماية السيرفر.',
            '> قد يكون سبب الحظر أن حسابك تم اختراقه،',
            '> أو أنك أرسلت بالخطأ في روم ممنوع.',
            '',
            '**⏰ مدة الحظر: 24 ساعة**',
            'سيتم فك الحظر تلقائياً بعد انتهاء المدة.',
            '',
            'إذا كنت تعتقد أن هذا خطأ، تواصل مع مالك السيرفر.',
          ].join('\n'))
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  الحماية التلقائية' });
        await message.author.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch {}

      // Send log to alert channel
      try {
        const logChDoc = await GuildConfig.findOne({ guildId: guild.id, key: 'log_channel' }).lean();
        const modLogDoc = await GuildConfig.findOne({ guildId: guild.id, key: 'modlog_channel' }).lean();
        const logChId = logChDoc?.value;
        const modLogId = modLogDoc?.value;
        const alertChId = modLogId || logChId;

        if (alertChId) {
          const alertCh = await guild.channels.fetch(alertChId).catch(() => null);
          if (alertCh) {
            const logEmbed = new EmbedBuilder()
              .setColor(Colors.BLOOD)
              .setTitle('🚨 روم محضور — تم اكتشاف مخالف')
              .addFields(
                { name: '👤 المستخدم', value: `${message.author} \`${message.author.tag}\``, inline: true },
                { name: '💬 القناة',   value: `${channel}`,                                 inline: true },
                { name: '📋 الإجراء',  value: banned ? 'حظر لمدة يوم ✅' : 'حذف الرسائل ❌',   inline: true },
                { name: '📝 محتوى الرسالة', value: `\`\`\`${(message.content || '(بدون نص)').slice(0, 990)}\`\`\``, inline: false },
              )
              .setTimestamp()
              .setFooter({ text: '⚔️ FX9-SYS  •  الرومات المحضورة' });
            if (message.attachments.size > 0) {
              logEmbed.addFields({
                name: '📎 المرفقات',
                value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n').slice(0, 1024),
                inline: false,
              });
            }
            await alertCh.send({ embeds: [logEmbed] }).catch(() => {});
          }
        }
      } catch {}

      return;
    }
  }

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
  const spamData  = await getSpamData(guildId, userId);
  let count       = 1;
  let lastReset   = now;

  if (spamData && now - spamData.lastReset < SPAM_WINDOW_MS) {
    count     = spamData.messageCount + 1;
    lastReset = spamData.lastReset;
  }
  await upsertSpamData(guildId, userId, count, lastReset);

  if (count >= SPAM_THRESHOLD) {
    await upsertSpamData(guildId, userId, 0, now);

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
