import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as db from './db.js';
import { resolveGuildImage } from '../utils/guildImage.js';

const VOICE_PANEL_IMAGE = fileURLToPath(new URL('../../assets/voice-panel.png', import.meta.url));

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

export function buildStatusPanel(guildId, setup, activeCount = 0) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vc_lock').setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vc_unlock').setLabel('Unlock').setEmoji('🔓').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('vc_hide').setLabel('Hide').setEmoji('🙈').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vc_show').setLabel('Show').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vc_limit').setLabel('Member limit').setEmoji('👥').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vc_rename').setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vc_kick').setLabel('Kick').setEmoji('🚪').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('vc_transfer').setLabel('Transfer').setEmoji('👑').setStyle(ButtonStyle.Secondary),
  );

  // Per-server panel artwork set from the dashboard, with the bundled default
  // as the fallback.
  const custom = guildId && resolveGuildImage(guildId, 'voice_panel_image');
  const attachment = custom ? (custom.buffer || custom.url) : VOICE_PANEL_IMAGE;

  return {
    files: [{ attachment, name: 'voice-panel.png' }],
    components: [row1, row2],
  };
}

export async function refreshPanel(client, guildId) {
  const setup = guildSetups.get(guildId);
  if (!setup) return;
  try {
    const guild = client.guilds.cache.get(guildId);
    const textCh = guild?.channels.cache.get(setup.textChannelId);
    if (!textCh) return;

    const count = getActiveCount(guildId);
    const panel = buildStatusPanel(guildId, setup, count);

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
