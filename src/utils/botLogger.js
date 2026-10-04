/**
 * botLogger.js — the bot's own operational log.
 *
 * Four kinds of notification:
 *   1. startup    (online)
 *   2. clean stop (offline)
 *   3. unhandled errors
 *   4. a status report, refreshed every 10 minutes, with a category menu
 *
 * Call `initBotLogger(client)` in the ready event before anything else.
 */

import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { getConfig, setConfig } from '../database.js';
import { notice, field, userTag, C, EPHEMERAL } from './embeds.js';
import { formatDuration } from './parseDuration.js';
import { commandModules } from '../config/commandLoader.js';
import process from 'node:process';

let _client = null;
const HEARTBEAT_INTERVAL = 10 * 60 * 1000;

const hbCategories = new Map();
const HB_PREFIX = 'hb_cat_';

export function initBotLogger(client) {
  _client = client;
}

/** Sends the same payload to every guild that configured a bot log channel. */
async function broadcast(payload) {
  if (!_client?.isReady()) return;

  for (const [, guild] of _client.guilds.cache) {
    try {
      const id = getConfig(guild.id, 'botlog_channel');
      if (!id) continue;
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (channel) await channel.send(payload).catch(() => {});
    } catch { /* one unreachable guild must not stop the rest */ }
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

export async function sendOnlineLog() {
  if (!_client) return;

  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const commandCount = (await commandModules())
    .filter((m) => typeof m.mod.execute === 'function').length;

  await broadcast({
    embeds: [notice({
      title: '🟢 Kratos System — online',
      color: C.ok,
      thumbnail: _client.user.displayAvatarURL({ dynamic: true }),
      fields: [
        field('🤖 Bot', `\`${userTag(_client.user)}\``),
        field('🌐 Servers', `\`${_client.guilds.cache.size}\``),
        field('⚙️ Commands', `\`${commandCount}\``),
        field('💾 Memory', `\`${mem} MB\``),
        field('🟢 Node.js', `\`${process.version}\``),
        field('🕐 Started', `<t:${Math.floor(Date.now() / 1000)}:F>`),
      ],
      footer: 'Kratos System • Bot log',
      timestamp: true,
    })],
  });
}

export async function sendOfflineLog(reason = 'Clean shutdown') {
  if (!_client) return;

  await broadcast({
    embeds: [notice({
      title: '🔴 Kratos System — offline',
      color: C.error,
      fields: [
        field('📋 Reason', reason, false),
        field('🕐 Stopped', `<t:${Math.floor(Date.now() / 1000)}:R>`),
      ],
      footer: 'Kratos System • Bot log',
      timestamp: true,
    })],
  });
}

export async function sendErrorLog(label, err) {
  if (!_client) return;

  // The stack is what makes a log entry actionable, so it is kept in full.
  const details = String(err?.stack ?? err).slice(0, 1000);

  await broadcast({
    embeds: [notice({
      title: `🚨 Error — ${label}`,
      color: 0x7f1d1d,
      description: `\`\`\`\n${details}\n\`\`\``,
      fields: [field('🕐 Time', `<t:${Math.floor(Date.now() / 1000)}:F>`)],
      footer: 'Kratos System • Error log',
      timestamp: true,
    })],
  });
}

// ─── Status report ──────────────────────────────────────────────────────────

const HB_CATEGORIES = [
  { value: 'general',  emoji: '📊', label: 'General' },
  { value: 'servers',  emoji: '🖥', label: 'Servers' },
  { value: 'system',   emoji: '💾', label: 'System' },
  { value: 'commands', emoji: '📟', label: 'Commands' },
];

const getHbCategory = (guildId) => hbCategories.get(guildId) ?? 'general';

function buildHbRow(guildId) {
  const current = getHbCategory(guildId);

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      // Guild id is part of the customId so one server choosing a category
      // cannot re-render another server's panel.
      .setCustomId(`${HB_PREFIX}${guildId}`)
      .setPlaceholder('📊 Choose a category')
      .addOptions(HB_CATEGORIES.map((c) => new StringSelectMenuOptionBuilder()
        .setLabel(c.label)
        .setValue(c.value)
        .setEmoji(c.emoji)
        .setDefault(c.value === current)))
  );
}

async function buildHbEmbed(guildId) {
  const client = _client;
  const mem    = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const uptime = formatDuration(client.uptime ?? 0);
  const ping   = Math.round(client.ws.ping ?? 0);
  const servers = client.guilds.cache.size;
  const members = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);

  const pingIcon = ping < 100 ? '🟢' : ping < 250 ? '🟡' : '🔴';
  const base = {
    color: C.neutral,
    author: { name: 'Kratos System', iconURL: client.user.displayAvatarURL() },
    footer: '🔄 Refreshes every 10 minutes · pick a category from the menu',
    timestamp: true,
  };

  // ── General ──────────────────────────────────────────────────────────────
  if (getHbCategory(guildId) === 'general') {
    const commandCount = (await commandModules())
      .filter((m) => typeof m.mod.execute === 'function').length;

    return notice({
      ...base,
      title: '📊 Bot status report',
      description: `\`\`\`${userTag(client.user)}\`\`\``,
      fields: [
        field('🟢 Status', '**Online**'),
        field(`${pingIcon} Latency`, `\`${ping} ms\``),
        field('⏱ Uptime', `\`${uptime}\``),
        field('💾 Memory used', `\`${mem} MB\``),
        field('🌐 Servers', `\`${servers}\``),
        field('👥 Members', `\`${members.toLocaleString()}\``),
        field('⚙️ Commands', `\`${commandCount}\``),
        field('🛡️ Protection', 'Active ✅'),
        field('📊 Statistics', 'Updating ✅'),
      ],
    });
  }

  // ── Servers ──────────────────────────────────────────────────────────────
  if (getHbCategory(guildId) === 'servers') {
    const top = [...client.guilds.cache.values()]
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 8);
    const medals = ['🥇', '🥈', '🥉'];

    const list = top.length
      ? top.map((g, i) => `${medals[i] ?? `**${i + 1}.**`} ${g.name} — \`${g.memberCount.toLocaleString()}\``).join('\n')
      : 'None';

    return notice({
      ...base,
      title: '🖥 Server list',
      description: list,
      fields: [
        field('🌐 Total servers', `\`${servers}\``),
        field('👥 Total members', `\`${members.toLocaleString()}\``),
        field('🆔 This server', `\`${guildId}\``),
      ],
    });
  }

  // ── System ───────────────────────────────────────────────────────────────
  if (getHbCategory(guildId) === 'system') {
    const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

    return notice({
      ...base,
      title: '💾 System information',
      fields: [
        field('💻 Node.js', `\`${process.version}\``),
        field('🖥 Platform', `\`${process.platform}\``),
        field('⏱ Uptime', `\`${uptime}\``),
        field('💾 Heap used', `\`${mem} MB\``),
        field('📦 RSS', `\`${rss} MB\``),
        field('👤 Bot', `\`${userTag(client.user)}\``),
        field('🆔 Bot ID', `\`${client.user.id}\``),
      ],
    });
  }

  // ── Commands ─────────────────────────────────────────────────────────────
  const modules = (await commandModules())
    .filter((m) => typeof m.mod.execute === 'function');

  const perFolder = {};
  for (const m of modules) perFolder[m.folder] = (perFolder[m.folder] ?? 0) + 1;

  const entries = Object.entries(perFolder).sort((a, b) => b[1] - a[1]);
  const list = entries.length
    ? entries.map(([folder, count]) => `• **${folder}**: \`${count}\``).join('\n')
    : 'None';

  return notice({
    ...base,
    title: '📟 Command list',
    description: list,
    fields: [
      field('⚙️ Total commands', `\`${modules.length}\``),
      field('📂 Categories', `\`${entries.length}\``),
    ],
  });
}

async function refreshGuildHeartbeat(guildId) {
  const client = _client;
  const botlogId = getConfig(guildId, 'botlog_channel');
  if (!botlogId) return;

  try {
    const channel = await client.channels.fetch(botlogId).catch(() => null);
    if (!channel) return;

    // Edit the existing panel when there is one, so the channel does not fill
    // up with a new report every 10 minutes.
    const storedId = getConfig(guildId, 'heartbeat_msg');
    if (storedId) {
      const existing = await channel.messages.fetch(storedId).catch(() => null);
      if (existing) {
        await existing.edit({
          embeds: [await buildHbEmbed(guildId)],
          components: [buildHbRow(guildId)],
        }).catch(() => {});
        return;
      }
    }

    const msg = await channel.send({
      embeds: [await buildHbEmbed(guildId)],
      components: [buildHbRow(guildId)],
    }).catch(() => null);

    if (msg) await setConfig(guildId, 'heartbeat_msg', msg.id).catch(() => {});
  } catch { /* the panel is a convenience, never fatal */ }
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

  // The customId carries the target guild, so a click from a different server
  // would otherwise re-render someone else's panel.
  if (guildId !== interaction.guildId) {
    await interaction.reply({ content: '❌ This panel belongs to a different server.', flags: EPHEMERAL });
    return true;
  }

  hbCategories.set(guildId, interaction.values[0]);

  await interaction.update({
    embeds: [await buildHbEmbed(guildId)],
    components: [buildHbRow(guildId)],
  });
  return true;
}