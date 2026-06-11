/**
 * botLogger.js — مركز سجلات البوت
 *
 * هذا الملف يُعالج ثلاثة أنواع من الإشعارات:
 *  1. تشغيل البوت (online)
 *  2. إيقاف البوت (offline)
 *  3. الأخطاء غير المتوقعة (error)
 *  4. تقرير الحالة كل 10 دقائق (heartbeat)
 *
 * يجب استدعاء initBotLogger(client) في حدث ready قبل أي شيء آخر.
 */

import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { Colors } from './embeds.js';
import { formatDuration } from './parseDuration.js';
import process from 'node:process';

let _client = null;
const HEARTBEAT_INTERVAL = 10 * 60 * 1000; // 10 دقائق

/** تهيئة الـ logger بمرجع الـ client */
export function initBotLogger(client) {
  _client = client;
}

/** إرسال embed لجميع قنوات botlog في كل السيرفرات */
async function broadcast(embed) {
  if (!_client?.isReady()) return;
  for (const [, guild] of _client.guilds.cache) {
    try {
      const id = getConfig(guild.id, 'botlog_channel');
      if (!id) continue;
      const ch = await guild.channels.fetch(id).catch(() => null);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
    } catch { /* تجاهل */ }
  }
}

/** 🟢 إشعار تشغيل البوت */
export async function sendOnlineLog() {
  if (!_client) return;
  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  await broadcast(
    new EmbedBuilder()
      .setColor(Colors.WHITE)
      .setTitle('🟢 FX9-SYS — متصل الآن')
      .addFields(
        { name: '🤖  البوت',          value: `\`${_client.user.tag}\``,             inline: true },
        { name: '🌐  السيرفرات',      value: `\`${_client.guilds.cache.size}\``,     inline: true },
        { name: '⚙️  الأوامر',        value: `\`${_client.commands?.size ?? 0}\``,   inline: true },
        { name: '💾  الذاكرة',        value: `\`${mem} MB\``,                         inline: true },
        { name: '🟢  Node.js',        value: `\`${process.version}\``,               inline: true },
        { name: '🕐  وقت التشغيل',   value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      )
      .setThumbnail(_client.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  سجل البوت' })
  );
}

/** 🔴 إشعار إيقاف البوت */
export async function sendOfflineLog(reason = 'إيقاف منظّم') {
  if (!_client) return;
  await broadcast(
    new EmbedBuilder()
      .setColor(Colors.CRIMSON)
      .setTitle('🔴 FX9-SYS — أوفلاين')
      .addFields(
        { name: '📋  السبب',          value: reason,                                   inline: true },
        { name: '🕐  وقت الإيقاف',   value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  سجل البوت' })
  );
}

/** 🚨 إشعار خطأ غير متوقع */
export async function sendErrorLog(label, err) {
  if (!_client) return;
  const errText = String(err?.stack ?? err).slice(0, 900);
  await broadcast(
    new EmbedBuilder()
      .setColor(Colors.BLOOD)
      .setTitle(`🚨  خطأ — ${label}`)
      .setDescription(`\`\`\`\n${errText}\n\`\`\``)
      .addFields({ name: '🕐  الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true })
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  سجل الأخطاء' })
  );
}

/** 📊 تقرير الحالة كل 10 دقائق */
async function sendHeartbeat() {
  if (!_client?.isReady()) return;

  const mem     = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const uptime  = formatDuration(_client.uptime ?? 0);
  const ping    = _client.ws.ping;
  const servers = _client.guilds.cache.size;
  const members = _client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const cmds    = _client.commands?.size ?? 0;

  const pingIcon = ping < 100 ? '🟢' : ping < 250 ? '🟡' : '🔴';

  await broadcast(
    new EmbedBuilder()
      .setColor(Colors.DARK)
      .setTitle('📊  تقرير حالة البوت')
      .addFields(
        { name: '🟢  الاتصال',       value: 'متصل',              inline: true },
        { name: `${pingIcon}  Ping`, value: `\`${ping}ms\``,     inline: true },
        { name: '⏱️  وقت التشغيل',  value: uptime,              inline: true },
        { name: '💾  الذاكرة',       value: `\`${mem} MB\``,     inline: true },
        { name: '🌐  السيرفرات',     value: `\`${servers}\``,    inline: true },
        { name: '👥  الأعضاء',       value: `\`${members}\``,    inline: true },
        { name: '⚙️  الأوامر',       value: `\`${cmds}\` ✅`,    inline: true },
        { name: '🛡️  الحماية',       value: 'مفعّلة ✅',         inline: true },
        { name: '📊  الإحصائيات',    value: 'كل دقيقة ✅',       inline: true },
      )
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  تقرير الحالة التلقائي كل 10 دقائق' })
  );
}

/** تشغيل تقرير الحالة الدوري */
export function startHeartbeat() {
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}
