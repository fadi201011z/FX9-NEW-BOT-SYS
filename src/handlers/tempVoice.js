import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import * as db from './db.js';

const guildSetups = new Map();
const activeChannels = new Map();

export async function loadFromDisk() {
  const [guilds, channels] = await Promise.all([db.loadGuilds(), db.loadActiveChannels()]);
  for (const [id, cfg] of Object.entries(guilds)) guildSetups.set(id, cfg);
  for (const [id, cfg] of Object.entries(channels)) activeChannels.set(id, cfg);
  console.log(`[TempVC] Loaded ${guildSetups.size} guild(s), ${activeChannels.size} active channel(s)`);
}

export async function setGuildSetup(guildId, config) {
  guildSetups.set(guildId, config);
  await db.saveGuild(guildId, config);
}

export function getGuildSetup(guildId) { return guildSetups.get(guildId) || null; }

export function getAllSetups() { return guildSetups; }

export async function updatePanelMessageId(guildId, messageId) {
  const cfg = guildSetups.get(guildId);
  if (!cfg) return;
  cfg.panelMessageId = messageId;
  guildSetups.set(guildId, cfg);
  await db.saveGuild(guildId, cfg);
}

export async function registerChannel(vcId, data) {
  activeChannels.set(vcId, data);
  await db.saveActiveChannel(vcId, data);
}

export function getChannel(vcId) { return activeChannels.get(vcId) || null; }

export async function deleteChannel(vcId) {
  activeChannels.delete(vcId);
  await db.removeActiveChannel(vcId);
}

export function isOwner(vcId, userId) { return activeChannels.get(vcId)?.ownerId === userId; }

export function getChannelByOwner(guildId, userId) {
  for (const [vcId, data] of activeChannels) {
    if (data.guildId === guildId && data.ownerId === userId) return { vcId, ...data };
  }
  return null;
}

export function getActiveCount(guildId) {
  let count = 0;
  for (const [, data] of activeChannels) {
    if (data.guildId === guildId) count++;
  }
  return count;
}

export function buildStatusPanel(setup, activeCount = 0) {
  const embed = new EmbedBuilder()
    .setTitle('🎙️ نظام القنوات الصوتية المؤقتة')
    .setDescription(
      '**انضم إلى قناة ➕ لإنشاء قناتك الصوتية الخاصة!**\n\n' +
      '🔊 ستحصل على قناة باسمك فوراً\n' +
      '🎛️ استخدم الأزرار أدناه للتحكم **بقناتك**\n' +
      '👑 كل شخص يتحكم بقناته الخاصة فقط\n\n' +
      `> 📊 القنوات النشطة الآن: **${activeCount}**`
    )
    .addFields(
      { name: '📁 الفئة', value: `<#${setup.categoryId}>`, inline: true },
      { name: '🔊 قناة الانضمام', value: `<#${setup.joinChannelId}>`, inline: true },
      { name: '📊 الحالة', value: '✅ نشط', inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'FX9-VOICE • كل زر يتحكم بقناتك أنت فقط' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vc_lock').setLabel('🔒 قفل').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vc_unlock').setLabel('🔓 فتح').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('vc_hide').setLabel('🙈 إخفاء').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vc_show').setLabel('👁️ إظهار').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vc_limit').setLabel('👥 حد الأعضاء').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vc_rename').setLabel('✏️ تسمية').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vc_kick').setLabel('👢 طرد عضو').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vc_transfer').setLabel('👑 نقل الملكية').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function refreshPanel(client, guildId) {
  const setup = guildSetups.get(guildId);
  if (!setup) return;
  try {
    const guild = client.guilds.cache.get(guildId);
    const textCh = guild?.channels.cache.get(setup.textChannelId);
    if (!textCh) return;

    const count = getActiveCount(guildId);
    const panel = buildStatusPanel(setup, count);

    if (setup.panelMessageId) {
      const msg = await textCh.messages.fetch(setup.panelMessageId).catch(() => null);
      if (msg) { await msg.edit(panel).catch(() => {}); return; }
    }
    const msg = await textCh.send(panel);
    updatePanelMessageId(guildId, msg.id);
  } catch (err) {
    console.error('[TempVC] refreshPanel:', err.message);
  }
}

export async function cleanStaleChannels(client) {
  let cleaned = 0;
  for (const [vcId, data] of activeChannels) {
    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) { await deleteChannel(vcId); cleaned++; continue; }
    const vc = guild.channels.cache.get(vcId);
    if (!vc) { await deleteChannel(vcId); cleaned++; }
  }
  if (cleaned > 0) console.log(`[TempVC] 🧹 Cleaned ${cleaned} stale channel entries`);
}
