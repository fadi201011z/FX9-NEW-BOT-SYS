import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as db from './db.js';
import { resolveGuildImage } from '../utils/guildImage.js';
import { getDisplayMode, buildCustomEmbed } from '../utils/customDisplay.js';
import { ico } from '../utils/voiceIcons.js';

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

/**
 * The temp channel a panel action should act on.
 *
 * Ownership alone is ambiguous once someone owns more than one room (the clone
 * button creates a second one). So the room the member is standing in wins when
 * they own it, and ownership is only the fallback for clicking the panel from
 * outside voice.
 */
export function resolveOwnedChannel(guildId, member) {
  const currentId = member?.voice?.channelId;
  if (currentId) {
    const data = activeChannels.get(currentId);
    if (data && data.guildId === guildId && data.ownerId === member.id) {
      return { vcId: currentId, ...data };
    }
  }
  return getChannelByOwner(guildId, member.id);
}

export function getActiveCount(guildId) {
  let count = 0;
  for (const [, data] of activeChannels) {
    if (data.guildId === guildId) count++;
  }
  return count;
}

export function buildStatusPanel(guildId, setup, activeCount = 0) {
  // Buttons carry the bot's own artwork (application emojis, see voiceIcons.js)
  // and every one sits in the neutral grey style, so the panel reads as a single
  // calm surface and the meaning lives in the icon rather than in the colour.
  // `ico` falls back to a Unicode glyph if the artwork could not be uploaded, so
  // a button never loses its mark. One helper keeps the rows from drifting apart.
  const button = (customId) =>
    new ButtonBuilder().setCustomId(customId).setEmoji(ico(customId)).setStyle(ButtonStyle.Secondary);

  // Row 1 — access & visibility.
  const row1 = new ActionRowBuilder().addComponents(
    button('vc_lock'),
    button('vc_unlock'),
    button('vc_hide'),
    button('vc_show'),
    button('vc_info'),
  );
  // Row 2 — room settings.
  const row2 = new ActionRowBuilder().addComponents(
    button('vc_rename'),
    button('vc_limit'),
    button('vc_bitrate'),
    button('vc_region'),
    button('vc_clone'),
  );
  // Row 3 — ownership & invitations.
  const row3 = new ActionRowBuilder().addComponents(
    button('vc_claim'),
    button('vc_transfer'),
    button('vc_invite'),
    button('vc_permit'),
    button('vc_reject'),
  );
  // Row 4 — people & room audio.
  const row4 = new ActionRowBuilder().addComponents(
    button('vc_kick'),
    button('vc_summon'),
    button('vc_muteall'),
    button('vc_unmuteall'),
    button('vc_deafenall'),
  );
  // Row 5 — remaining audio, reset, and the danger zone.
  const row5 = new ActionRowBuilder().addComponents(
    button('vc_undeafenall'),
    button('vc_reset'),
    button('vc_delete'),
  );

  const rows = [row1, row2, row3, row4, row5];

  // Per-server panel artwork set from the dashboard, with the bundled default
  // as the fallback. In embed mode the admin-built embed replaces the artwork;
  // the buttons stay in both cases. `attachments: []` / `embeds: []` make an
  // edit that flips the mode clear the previous representation.
  if (getDisplayMode(guildId, 'voice') === 'embed') {
    const embed = buildCustomEmbed(guildId, 'voice', { count: activeCount });
    if (embed) return { embeds: [embed], attachments: [], components: rows };
  }

  const custom = guildId && resolveGuildImage(guildId, 'voice_panel_image');
  const attachment = custom ? (custom.buffer || custom.url) : VOICE_PANEL_IMAGE;

  return {
    files: [{ attachment, name: 'voice-panel.png' }],
    embeds: [],
    attachments: [],
    components: rows,
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
