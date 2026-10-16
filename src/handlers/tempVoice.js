import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as db from './db.js';
import { resolveGuildImage } from '../utils/guildImage.js';
import { getDisplayMode, buildCustomEmbed } from '../utils/customDisplay.js';
import { notice, field, C } from '../utils/embeds.js';
import { ico, icoText, PANEL_GROUPS } from '../utils/voiceIcons.js';

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
  // a button never loses its mark. The layout comes from PANEL_GROUPS — the same
  // description the room guide is written from — so the panel and the guide can
  // never drift apart.
  const rows = PANEL_GROUPS.map((group) =>
    new ActionRowBuilder().addComponents(
      group.buttons.map((b) =>
        new ButtonBuilder().setCustomId(b.id).setEmoji(ico(b.id)).setStyle(ButtonStyle.Secondary)),
    ),
  );

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

/**
 * The welcome card posted into a brand-new room's own text chat.
 *
 * Someone dropped into a fresh voice channel has no reason to know the control
 * panel exists, let alone what twenty-three grey icons do. So the bot greets
 * them inside that room, spells every button out in the same groups the panel
 * uses, and points at the text channel that holds the panel itself.
 *
 * The connection was never stated to the user before; this is that statement.
 */
export function buildRoomGuide(ownerId, settingsChannelId) {
  const fields = PANEL_GROUPS.map((group) => field(
    group.title,
    group.buttons.map((b) => `${icoText(b.id)} **${b.label}** — ${b.desc}`).join('\n'),
    false,
  ));

  const where = settingsChannelId ? `<#${settingsChannelId}>` : 'قناة الإعدادات';
  const embed = notice({
    title: '🎛️ رومك الصوتي جاهز',
    color: C.accent,
    description:
      'هذا رومك الخاص — أنت من يتحكم به بالكامل.\n' +
      `📍 **مكان الأزرار:** ${where}\n` +
      'وهذه وظيفة كل زر:',
    fields,
    footer: 'Kratos System • غرفة صوتية مؤقتة',
  });

  return { content: `🎉 <@${ownerId}>`, embeds: [embed] };
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
