/**
 * botLogger.js — مركز سجلات البوت
 *
 * هذا الملف يُعالج ثلاثة أنواع من الإشعارات:
 *  1. تشغيل البوت (online)
 *  2. إيقاف البوت (offline)
 *  3. الأخطاء غير المتوقعة (error)
 *  4. تقرير الحالة التفاعلي كل 10 دقائق (heartbeat) مع قائمة منسدلة
 *
 * يجب استدعاء initBotLogger(client) في حدث ready قبل أي شيء آخر.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getConfig, setConfig } from '../database.js';
import { Colors } from './embeds.js';
import { formatDuration } from './parseDuration.js';
import process from 'node:process';

let _client = null;
const HEARTBEAT_INTERVAL = 10 * 60 * 1000;

const hbCategories = new Map();
const HB_PREFIX = 'hb_cat_';

export function initBotLogger(client) {
  _client = client;
}

async function broadcast(embed) {
  if (!_client?.isReady()) return;
  for (const [, guild] of _client.guilds.cache) {
    try {
      const id = getConfig(guild.id, 'botlog_channel');
      if (!id) continue;
      const ch = await guild.channels.fetch(id).catch(() => null);
      if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
    } catch {}
  }
}

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

function getHbCategory(guildId) {
  return hbCategories.get(guildId) || 'general';
}

function buildHbRow(guildId) {
  const cat = getHbCategory(guildId);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${HB_PREFIX}${guildId}`)
      .setPlaceholder('📊 اختر التصنيف')
      .addOptions(
        ['general', 'servers', 'system', 'commands'].map(v => {
          const labels = {
            general:  { emoji: '📊', label: 'عام' },
            servers:  { emoji: '🖥',  label: 'السيرفرات' },
            system:   { emoji: '💾',  label: 'النظام' },
            commands: { emoji: '📟',  label: 'الأوامر' },
          };
          return new StringSelectMenuOptionBuilder()
            .setLabel(labels[v].label)
            .setValue(v)
            .setEmoji(labels[v].emoji)
            .setDefault(v === cat);
        })
      )
  );
}

async function buildHbEmbed(guildId) {
  const client = _client;
  const cat = getHbCategory(guildId);
  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const uptime = formatDuration(client.uptime ?? 0);
  const ping = client.ws.ping;
  const servers = client.guilds.cache.size;
  const members = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const cmds = client.commands?.size ?? 0;
  const pingIcon = ping < 100 ? '🟢' : ping < 250 ? '🟡' : '🔴';

  const embed = new EmbedBuilder()
    .setColor(Colors.DARK)
    .setAuthor({ name: 'FX9-SYS', iconURL: client.user.displayAvatarURL() })
    .setTimestamp()
    .setFooter({ text: '🔄 يتحدث كل 10 دقائق • اختر تصنيفاً من القائمة' });

  if (cat === 'general') {
    embed.setTitle('📊 تقرير حالة البوت');
    embed.setDescription(`\`\`\`${client.user.tag}\`\`\``);
    embed.addFields(
      { name: '🟢 الحالة', value: '**متصل** ✅', inline: true },
      { name: `${pingIcon} سرعة الإستجابة`, value: `\`${ping}ms\``, inline: true },
      { name: '⏱ وقت التشغيل', value: `\`${uptime}\``, inline: true },
      { name: '💾 الذاكرة المستخدمة', value: `\`${mem} MB\``, inline: true },
      { name: '🌐 السيرفرات', value: `\`${servers}\``, inline: true },
      { name: '👥 الأعضاء', value: `\`${members.toLocaleString()}\``, inline: true },
      { name: '⚙️ الأوامر', value: `\`${cmds}\` ✅`, inline: true },
      { name: '🛡️ أنظمة الحماية', value: 'نشطة ✅', inline: true },
      { name: '📊 الإحصائيات', value: 'تُحدث تلقائياً ✅', inline: true },
    );
  } else if (cat === 'servers') {
    embed.setTitle('🖥 قائمة السيرفرات');
    const sorted = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount).slice(0, 8);
    const list = sorted.map((g, i) => `**${i + 1}.** ${g.name} — \`${g.memberCount.toLocaleString()}\``).join('\n');
    embed.setDescription(list || 'لا يوجد');
    embed.addFields(
      { name: '📊 إجمالي السيرفرات', value: `\`${servers}\``, inline: true },
      { name: '👥 إجمالي الأعضاء', value: `\`${members.toLocaleString()}\``, inline: true },
      { name: '🆔 هذا السيرفر', value: `\`${guildId}\``, inline: true },
    );
  } else if (cat === 'system') {
    const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    embed.setTitle('💾 معلومات النظام');
    embed.addFields(
      { name: '💻 إصدار Node.js', value: `\`${process.version}\``, inline: true },
      { name: '🖥 المنصة', value: `\`${process.platform}\``, inline: true },
      { name: '⏱ وقت التشغيل', value: `\`${uptime}\``, inline: true },
      { name: '💾 Heap المستخدم', value: `\`${mem} MB\``, inline: true },
      { name: '📦 RSS', value: `\`${rss} MB\``, inline: true },
      { name: '👤 البوت', value: `\`${client.user.tag}\``, inline: true },
      { name: '🆔 البوت', value: `\`${client.user.id}\``, inline: true },
    );
  } else if (cat === 'commands') {
    embed.setTitle('📟 قائمة الأوامر');
    const cmdCategories = {};
    if (client.commands) {
      for (const [, cmd] of client.commands) {
        const folder = cmd.category || cmd.folder?.name || 'أخرى';
        cmdCategories[folder] = (cmdCategories[folder] || 0) + 1;
      }
    }
    const entries = Object.entries(cmdCategories).sort((a, b) => b[1] - a[1]);
    const catList = entries.map(([c, n]) => `• **${c}**: \`${n}\` أمـر`).join('\n');
    embed.setDescription(catList || 'لا توجد أوامر');
    embed.addFields(
      { name: '⚙️ إجمالي الأوامر', value: `\`${cmds}\``, inline: true },
      { name: '📂 عدد التصنيفات', value: `\`${entries.length}\``, inline: true },
    );
  }

  return embed;
}

async function refreshGuildHeartbeat(guildId) {
  const client = _client;
  const botlogId = getConfig(guildId, 'botlog_channel');
  if (!botlogId) return;
  try {
    const ch = await client.channels.fetch(botlogId).catch(() => null);
    if (!ch) return;
    const embed = await buildHbEmbed(guildId);
    const row = buildHbRow(guildId);
    const storedId = getConfig(guildId, 'heartbeat_msg');
    if (storedId) {
      try {
        const msg = await ch.messages.fetch(storedId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
          return;
        }
      } catch {}
    }
    const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (msg) await setConfig(guildId, 'heartbeat_msg', msg.id).catch(() => {});
  } catch {}
}

async function refreshAllHeartbeats() {
  if (!_client?.isReady()) return;
  for (const [, guild] of _client.guilds.cache) {
    await refreshGuildHeartbeat(guild.id);
  }
}

export function startHeartbeat() {
  refreshAllHeartbeats();
  setInterval(refreshAllHeartbeats, HEARTBEAT_INTERVAL);
}

export async function handleHeartbeatSelect(interaction) {
  if (!interaction.customId.startsWith(HB_PREFIX)) return false;
  const guildId = interaction.customId.slice(HB_PREFIX.length);
  const value = interaction.values[0];
  if (guildId !== interaction.guildId) {
    await interaction.reply({ content: '❌ هذا الإشعار خاص بسيرفر آخر', ephemeral: true });
    return true;
  }
  hbCategories.set(guildId, value);
  const embed = await buildHbEmbed(guildId);
  const row = buildHbRow(guildId);
  await interaction.update({ embeds: [embed], components: [row] });
  return true;
}
