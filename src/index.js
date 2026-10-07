import { Client, Collection, GatewayIntentBits, Partials, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { readdir } from 'fs/promises';
import { existsSync, writeFileSync, createReadStream } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import 'dotenv/config';
import { commandModules } from './config/commandLoader.js';
import { notice, field, C } from './utils/embeds.js';
import { initBotLogger, sendOnlineLog, sendOfflineLog, sendErrorLog, startHeartbeat } from './utils/botLogger.js';
import { setMaintenancePresence, clearMaintenancePresence } from './utils/presence.js';
import { sendMaintenanceStart, sendMaintenanceEnd } from './utils/maintenanceEmbed.js';
import express from 'express';
import { loadFromDisk, cleanStaleChannels } from './handlers/tempVoice.js';
import { loadAllData } from './data/ticketDB.js';
import { loadAllSubscriptions } from './data/notificationDB.js';
import Feature from './models/Feature.js';
import { loadFeatures, isEnabled, featureForEvent } from './utils/features.js';
import { notifyFeatureChanges } from './utils/featureNotify.js';
import { dayKeys } from './utils/guildStats.js';
import GuildStats from './models/GuildStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Express Server (Keep-Alive) ──────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT) || 10000;

// ─── Internal API Guard ────────────────────────────────────────────────────
// The dashboard talks to this API across hosts. Without a shared secret the
// /api/* routes are world-readable: anyone could dump your members or stop
// the bot via /api/maintenance/sync. Every /api call must present the secret.
const API_SECRET = process.env.API_SECRET || '';
app.use('/api', (req, res, next) => {
  if (!API_SECRET) {
    return res.status(503).json({ error: 'API disabled: API_SECRET not configured' });
  }
  const provided = req.get('x-api-key') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// This is a misconfiguration that produces no visible symptom on the bot side —
// the process boots, logs in and looks perfectly healthy, while the dashboard
// quietly reports "offline" forever. The single-line log below this used to be
// easy to miss in a wall of startup output, and diagnosing it from the
// dashboard side costs a round trip per guess. Print a block instead.
if (!API_SECRET) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  ✗ API_SECRET IS NOT SET — every /api/* request returns 503   ║');
  console.error('║                                                              ║');
  console.error('║  The dashboard cannot read your stats, guild list or command  ║');
  console.error('║  counts, so it shows the bot as permanently offline.          ║');
  console.error('║                                                              ║');
  console.error('║  FIX: in this service\'s environment variables, set            ║');
  console.error('║       API_SECRET to the exact same value you set on the       ║');
  console.error('║       dashboard service. Generate one with:                   ║');
  console.error('║       node -e "console.log(require(\'crypto\')                 ║');
  console.error('║         .randomBytes(48).toString(\'hex\'))"                  ║');
  console.error('║  Then restart this service.                                    ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
}

app.get('/', (req, res) => res.send('Kratos System is Online! ✅'));
app.use(express.json());

// ─── Member Resolution (gateway cache first, REST pagination guarantee) ───
function formatApiMember(m) {
  return {
    id: m.user.id,
    username: m.user.username,
    globalName: m.user.globalName,
    displayName: m.user.globalName || m.user.username,
    avatar: m.user.avatar,
    roles: m.roles || [],
  };
}

async function resolveGuildMembers(guild) {
  let cacheMembers = [];
  try { await guild.members.fetch(); } catch {}
  cacheMembers = [...guild.members.cache.values()];
  if (cacheMembers.length >= guild.memberCount) {
    return cacheMembers.map(m => ({
      id: m.user.id,
      username: m.user.username,
      globalName: m.user.globalName,
      displayName: m.displayName,
      avatar: m.user.avatar,
      roles: m.roles.cache.map(r => r.id),
    }));
  }
  // REST pagination — complete list regardless of gateway cache/intent state
  const restMembers = [];
  let after;
  for (let i = 0; i < 10; i++) {
    const url = new URL(`https://discord.com/api/guilds/${guild.id}/members`);
    url.searchParams.set('limit', '1000');
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url, { headers: { Authorization: `Bot ${process.env.TOKEN}` } });
    if (!res.ok) throw new Error(`Discord members REST failed: ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    restMembers.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  return restMembers.map(formatApiMember);
}

// Accurate per-role member counts, cached 30s
const roleCountCache = new Map();
async function getRoleCounts(guild) {
  const now = Date.now();
  const hit = roleCountCache.get(guild.id);
  if (hit && now - hit.at < 30000) return hit.counts;
  const counts = {};
  try {
    const members = await resolveGuildMembers(guild);
    for (const m of members) for (const rid of m.roles) counts[rid] = (counts[rid] || 0) + 1;
  } catch {
    for (const m of guild.members.cache.values()) {
      for (const rid of m.roles.cache) counts[rid.id] = (counts[rid.id] || 0) + 1;
    }
  }
  roleCountCache.set(guild.id, { at: now, counts });
  return counts;
}

app.post('/api/sync-command', async (req, res) => {
  const { guildId, commandName, enabled, allowedRoles, blockedRoles } = req.body;
  if (!guildId || !commandName) return res.status(400).json({ error: 'Missing guildId or commandName' });
  const { setCommandConfig } = await import('./database.js');
  await setCommandConfig(guildId, commandName, {
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    allowedRoles: allowedRoles || [],
    blockedRoles: blockedRoles || [],
  });
  console.log(`[API] Command "${commandName}" updated in ${guildId}`);
  res.json({ synced: true });
});

app.post('/api/sync-all-configs', async (req, res) => {
  const { guildId, configs } = req.body;
  if (!guildId || !Array.isArray(configs)) return res.status(400).json({ error: 'Missing guildId or configs array' });
  try {
    const { setCommandConfig } = await import('./database.js');
    for (const cfg of configs) {
      await setCommandConfig(guildId, cfg.commandName || cfg.command_name, {
        enabled: cfg.enabled === true || cfg.enabled === 1,
        allowedRoles: cfg.allowedRoles || (cfg.allowed_roles ? JSON.parse(cfg.allowed_roles) : []),
        blockedRoles: cfg.blockedRoles || (cfg.blocked_roles ? JSON.parse(cfg.blocked_roles) : []),
      });
    }
    res.json({ synced: true, count: configs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync-config', async (_req, res) => {
  try {
    const { loadConfigsFromDB } = await import('./database.js');
    await loadConfigsFromDB();
    console.log('[API] Guild config cache reloaded from DB (dashboard sync)');
    res.json({ synced: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns the three default images (welcome / ticket panel / voice panel) so the
// dashboard can preview them via "view current image" when a guild has no
// custom artwork set.
app.get('/api/default-images/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const root = path.join(__dirname, '..');
    let filePath = null;
    if (type === 'ticket') {
      filePath = path.join(root, 'assets', 'panel.png');
    } else if (type === 'voice') {
      filePath = path.join(root, 'assets', 'voice-panel.png');
    } else if (type === 'welcome') {
      filePath = path.join(root, 'data', 'welcome_bg.png');
      if (!existsSync(filePath)) {
        // Fetch the default welcome artwork once and cache it on disk
        const bgURL = 'https://i.ibb.co/pvYMQfxt/Gemini-Generated-Image-gimcq9gimcq9gimc-clean.png';
        const resp = await fetch(bgURL);
        if (!resp.ok) return res.status(502).json({ error: 'Failed to fetch welcome bg' });
        writeFileSync(filePath, Buffer.from(await resp.arrayBuffer()));
      }
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Default image not found' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('------------------------------------------');
  console.log(`📡 Keep-alive Server: Active on Port ${PORT}`);
  console.log('------------------------------------------');
});

// ─── Discord Client — Merged Intents ──────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.Reaction,
  ],
});

// ─── Feature reload + announcements ───────────────────────────────────────
// One place reads the flags and announces whatever actually moved: at boot
// (cache is empty, so nothing is announced), every 5s, and right after the
// dashboard's /api/features/sync push. A single promise chain serialises the
// runs, so a sync push and the 5s tick racing for the same change means the
// first consumes it and the second sees nothing — never a duplicate notice.
let featureReload = Promise.resolve();

function reloadFeatures() {
  const run = async () => {
    try {
      const changes = await loadFeatures();
      if (changes.length) await notifyFeatureChanges(client, changes);
    } catch (err) {
      console.error('[Features] reload/notify failed:', err.message);
    }
  };
  featureReload = featureReload.then(run, run);
  return featureReload;
}

// ─── Dashboard-Facing API (module scope, not inside `ready`) ───────────────
// These three endpoints feed the dashboard's landing-page metrics, so they must
// respond from the moment the process starts — not from the moment Discord
// logs in. A Render free-tier service sleeps after ~15 min idle and then takes
// tens of seconds to boot and authenticate; during that window every request
// here used to 404 and the cards showed a blank dash forever.
// They only touch `client` at request time, so registering them early is safe.
app.get('/api/stats', (req, res) => {
  const ready = client.isReady();
  const guilds = ready ? client.guilds.cache.size : 0;

  // `memberCount` is undefined for guilds whose member list has not been
  // fetched yet. Summing it unguarded turned the total into NaN, and NaN is
  // falsy — so the dashboard's `members ? … : '—'` guard printed a dash.
  const members = ready
    ? client.guilds.cache.reduce(
        (sum, g) => sum + (Number.isFinite(g.memberCount) ? g.memberCount : 0),
        0,
      )
    : 0;

  // ws.ping is 0 until the first heartbeat round-trip completes. Report null
  // rather than 0 so the dashboard can show "unavailable" instead of a false
  // "0ms".
  const wsPing = client.ws?.ping;
  const ping = ready && Number.isFinite(wsPing) && wsPing > 0 ? Math.round(wsPing) : null;

  res.json({ online: ready, guilds, members, ping });
});

// Bot guild IDs for dashboard (to filter guilds where the bot is present)
app.get('/api/guilds', (req, res) => {
  const guildIds = client.isReady() ? client.guilds.cache.map(g => String(g.id)) : [];
  res.json({ guilds: guildIds, count: guildIds.length });
});

// Command statistics for dashboard (real count, from the loaded modules)
app.get('/api/commands/stats', async (req, res) => {
  const perCategory = {};
  let total = 0;
  try {
    for (const { folder, mod } of await commandModules()) {
      if (typeof mod.execute !== 'function') continue;
      perCategory[folder] = (perCategory[folder] ?? 0) + 1;
      total++;
    }
  } catch {}
  res.json({ total, categories: Object.keys(perCategory), perCategory });
});

// ─── Feature flags: control plane for the dashboard ────────────────────────
// The dashboard is the source of truth. It writes a feature's state and then
// pushes it here; this bot stores it in its own DB (works even when the two
// services use different databases) and the periodic reload picks it up.
app.get('/api/features', async (req, res) => {
  try {
    const docs = await Feature.find({}).lean();
    res.json({
      features: docs.map((d) => ({
        key: d.key,
        state: d.state || 'on',
        message: d.message || '',
        updatedAt: d.updatedAt || null,
        updatedBy: d.updatedBy || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/features/sync', async (req, res) => {
  try {
    const { key, state, message, updatedBy } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Missing key' });
    const allowed = ['on', 'off', 'maintenance'];
    const nextState = allowed.includes(state) ? state : 'on';
    await Feature.updateOne(
      { key },
      {
        $set: {
          key,
          state: nextState,
          message: typeof message === 'string' ? message.slice(0, 400) : '',
          updatedBy: typeof updatedBy === 'string' ? updatedBy.slice(0, 100) : '',
          updatedAt: Date.now(),
        },
      },
      { upsert: true },
    );
    console.log(`[Features] ${key} → ${nextState}`);
    res.json({ synced: true, key, state: nextState });
    // Fire-and-forget: the dashboard's save must not wait for a DM to every
    // server owner. This reload is what turns the toggle into notifications.
    reloadFeatures();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

client.commands = new Collection();

// ─── Load Commands ─────────────────────────────────────────────────────────
// Folders are discovered from disk by the shared loader, so a new command
// folder can never be registered with Discord but left without a handler here.
const loadedCommands = await commandModules();

for (const { name: commandName, folder, mod } of loadedCommands) {
  if (typeof mod.execute !== 'function') {
    console.warn(`  [CMD] /${commandName} (${folder}) has no execute() — not dispatchable, not registered`);
    continue;
  }
  client.commands.set(commandName, mod);
  console.log(`  [CMD] /${commandName}`);
}

// ─── Load Events ──────────────────────────────────────────────────────────
const eventsDir  = path.join(__dirname, 'events');
const eventFiles = (await readdir(eventsDir)).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = await import(pathToFileURL(path.join(eventsDir, file)).href);
  // Feature switchboard: an event that serves a disabled/under-maintenance
  // feature is skipped entirely. Only events mapped in FEATURE_BY_EVENT are
  // gated; `ready`/`guildCreate`/`guildDelete` and core events are never gated.
  const featureKey = featureForEvent(event.name);
  const run = (...args) => {
    if (featureKey && !isEnabled(featureKey)) return;
    return event.execute(...args, client);
  };
  if (event.once) {
    client.once(event.name, run);
  } else {
    client.on(event.name, run);
  }
  console.log(`  [EVT] ${event.name}${featureKey ? ` (feature: ${featureKey})` : ''}`);
}

// ─── Load Persistent Data ──────────────────────────────────────────────────
await Promise.all([loadFromDisk(), loadAllData(), loadAllSubscriptions()]);

// ─── Load DB Configs ──────────────────────────────────────────────────────
const { loadCommandConfigsFromDB, loadConfigsFromDB } = await import('./database.js');
await Promise.all([loadCommandConfigsFromDB(), loadConfigsFromDB()]);

// Feature states are read at boot and refreshed on the same cadence as the
// other config caches, so a dashboard toggle takes effect globally within a
// few seconds even if the push to /api/features/sync is missed.
await loadFeatures();

// Periodic reload of command configs + guild configs (picks up dashboard changes)
setInterval(() => loadCommandConfigsFromDB(), 5000);
setInterval(() => reloadFeatures(), 5000);
setInterval(() => loadConfigsFromDB(), 10000);
setInterval(() => loadAllSubscriptions().catch(e => console.error('[NotifDB] reload error:', e.message)), 15000);

// ─── Ready Handler ─────────────────────────────────────────────────────────
client.once('ready', async () => {
  initBotLogger(client);
  console.log(`[SYSTEM] Authorized: ${client.user.tag}`);

  // Clean stale temp voice channels
  await cleanStaleChannels(client);

  // NOTE: /api/stats, /api/guilds and /api/commands/stats are registered at
  // module scope — right after the Discord client is constructed — so they
  // answer even while the gateway handshake is still running. They used to
  // live in here, which meant they 404'd until `ready` fired: during a cold
  // start, a crash-restart or a Render free-tier wake-up the dashboard's live
  // metric cards had nothing to read and rendered empty.

  // Full command list for dashboard (live source of truth)
  app.get('/api/commands', async (req, res) => {
    let list = [];
    try {
      list = (await commandModules()).map(({ name, folder, file, mod }) => ({
        name,
        description: mod.data.description || '',
        category: folder,
        file,
        options: mod.data.options || [],
      }));
    } catch {}
    res.json(list);
  });

  // Rich guilds list for dashboard (dev page: all connected servers with details)
  app.get('/api/guilds/full', (req, res) => {
    const guilds = client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      memberCount: g.memberCount,
    }));
    res.json({ guilds, count: guilds.length });
  });

  // Server invite link for dashboard (dev page: join a connected server)
  const inviteCache = new Map(); // guildId -> { url, code, channelId, ts }
  app.get('/api/guilds/:guildId/invite', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const cached = inviteCache.get(guild.id);
    if (cached && Date.now() - cached.ts < 3600000) {
      return res.json({ url: cached.url, code: cached.code, channelId: cached.channelId, cached: true });
    }
    try {
      const botId = guild.members.me?.id || client.user?.id;
      const channel = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .find(c => c.permissionsFor(botId)?.has(PermissionFlagsBits.CreateInstantInvite));
      if (!channel) return res.status(403).json({ error: 'No text channel is available to create an invite in' });
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, reason: 'Kratos Dashboard — dev page join link' });
      const url = `https://discord.gg/${invite.code}`;
      inviteCache.set(guild.id, { url, code: invite.code, channelId: channel.id, ts: Date.now() });
      res.json({ url, code: invite.code, channelId: channel.id, cached: false });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'Failed to create the invite' });
    }
  });

  // Guild info for dashboard (member count without listing members)
  app.get('/api/guilds/:guildId/info', (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    res.json({ id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.memberCount });
  });

  // Daily history for the dashboard's "حالة سرفرك" page: joins and leaves as
  // they were counted, plus the day's highest presence sample. The response is
  // zero-filled over the whole window from `dayKeys`, so a server with three
  // days of data still sends 30 entries and the chart draws the silence
  // instead of pretending it never existed.
  app.get('/api/guilds/:guildId/stats', async (req, res) => {
    const guildId = req.params.guildId;
    if (!client.guilds.cache.has(guildId)) {
      return res.status(404).json({ error: 'Guild not found' });
    }
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 120);
    try {
      const keys = dayKeys(days);
      const rows = await GuildStats.find({ guildId, date: { $gte: keys[0] } })
        .sort({ date: 1 })
        .lean();
      const byDate = new Map(rows.map((r) => [r.date, r]));

      const series = keys.map((date) => {
        const row = byDate.get(date);
        return {
          date,
          joins: row?.joins || 0,
          leaves: row?.leaves || 0,
          onlinePeak: row?.onlinePeak || 0,
          memberCount: row ? row.memberCount : null,
        };
      });

      const totals = series.reduce(
        (acc, d) => ({
          joins: acc.joins + d.joins,
          leaves: acc.leaves + d.leaves,
          onlinePeak: Math.max(acc.onlinePeak, d.onlinePeak),
        }),
        { joins: 0, leaves: 0, onlinePeak: 0 },
      );

      res.json({
        guildId,
        days,
        series,
        totals: {
          joins: totals.joins,
          leaves: totals.leaves,
          net: totals.joins - totals.leaves,
          onlinePeak: totals.onlinePeak,
        },
        current: {
          memberCount: client.guilds.cache.get(guildId)?.memberCount ?? null,
        },
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'Stats unavailable' });
    }
  });

  // Guild roles with member counts for dashboard
  app.get('/api/guilds/:guildId/roles', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const counts = await getRoleCounts(guild);
    const roles = guild.roles.cache.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      position: r.position,
      permissions: r.permissions.bitfield.toString(),
      managed: r.managed,
      mentionable: r.mentionable,
      tags: r.tags,
      members_count: counts[r.id] || 0,
    }));
    res.json(roles);
  });

  // Guild channels for dashboard
  app.get('/api/guilds/:guildId/channels', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    res.json(guild.channels.cache.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
    })));
  });

  // Guild members (gateway cache with REST guarantee)
  app.get('/api/guilds/:guildId/members', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    try {
      res.json(await resolveGuildMembers(guild));
    } catch {
      res.json([...guild.members.cache.values()].map(m => ({
        id: m.user.id,
        username: m.user.username,
        globalName: m.user.globalName,
        displayName: m.displayName,
        avatar: m.user.avatar,
        roles: m.roles.cache.map(r => r.id),
      })));
    }
  });

  // Guild members filtered by role IDs (gateway cache with REST guarantee)
  app.get('/api/guilds/:guildId/members-by-roles', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const roleIds = req.query.roleIds ? req.query.roleIds.split(',') : [];
    try {
      const members = await resolveGuildMembers(guild);
      const filtered = members.filter(m => m.roles.some(r => roleIds.includes(r)));
      res.json(filtered);
    } catch {
      const filtered = [...guild.members.cache.values()]
        .filter(m => m.roles.cache.some(r => roleIds.includes(r.id)))
        .map(m => ({
          id: m.user.id,
          username: m.user.username,
          globalName: m.user.globalName,
          displayName: m.displayName,
          avatar: m.user.avatar,
          roles: m.roles.cache.map(r => r.id),
        }));
      res.json(filtered);
    }
  });

  // Notification API for dashboard
  app.get('/api/notifications/:guildId', async (req, res) => {
    const { getSubscriptions } = await import('./data/notificationDB.js');
    res.json(getSubscriptions(req.params.guildId));
  });

  app.post('/api/notifications/add', async (req, res) => {
    const { addSubscription } = await import('./data/notificationDB.js');
    const { resolveYouTubeChannelId } = await import('./handlers/notificationMonitor.js');
    const { guildId, platform, url, discordChannelId, customMessage, channelId: preResolvedId } = req.body;
    if (!guildId || !platform || !url || !discordChannelId) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    let channelId = preResolvedId || url;
    if (platform === 'youtube' && !preResolvedId) channelId = await resolveYouTubeChannelId(url);
    else if (platform === 'kick' && !preResolvedId) {
      const clean = url.trim().replace(/\/[?#].*$/, '').replace(/\/$/, '');
      const m = clean.match(/kick\.com\/(?:@?)([\w-]+)/i);
      channelId = m ? m[1] : clean.replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/.*$/, '');
    } else if (platform === 'twitter' && !preResolvedId) {
      const m = url.match(/(?:twitter\.com|x\.com)\/(\w+)/i);
      channelId = m ? m[1] : url.trim().replace(/^@/, '');
    }
    if (!channelId) return res.status(400).json({ error: 'Could not resolve channel ID from URL' });
    // Never store a raw URL as a usable channelId (would silently break the monitor)
    if (platform === 'youtube' && /^https?:\/\//i.test(channelId)) {
      return res.status(400).json({ error: 'Could not resolve a YouTube channel from that link — check the URL (e.g. https://youtube.com/@username)' });
    }
    try {
      const doc = await addSubscription({ guildId, platform, channelUrl: url, channelId, discordChannelId, customMessage });
      res.json({ success: true, id: doc._id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/notifications/:id', async (req, res) => {
    const { removeSubscription } = await import('./data/notificationDB.js');
    await removeSubscription(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/notifications/checknow/:id', async (req, res) => {
    const { getSubscription, updateSubscription, claimYouTubeVideo } = await import('./data/notificationDB.js');
    const { fetchLatestYouTubeVideo, fetchKickStream, fetchLatestTweet, youtubeEmbed, kickEmbed, twitterEmbed } = await import('./handlers/notificationMonitor.js');
    const { sendNotification } = await import('./handlers/notificationMonitor.js');
    const sub = getSubscription(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    if (sub.platform === 'youtube') {
      const video = await fetchLatestYouTubeVideo(sub.channelId);
      if (!video) return res.json({ found: false, error: 'Could not read the YouTube RSS feed' });
      const lastAt = Number(sub.lastVideoAt) || 0;
      if (lastAt > 0 && Number(video.publishedAt) <= lastAt) {
        return res.json({ found: false, message: 'No video newer than the last one sent.' });
      }
      const prevId = sub.lastVideoId;
      const claimed = await claimYouTubeVideo(sub._id.toString(), video);
      if (!claimed) return res.json({ found: false, message: 'This video was already sent (no duplicates).' });
      const sent = await sendNotification(client, sub, youtubeEmbed(video));
      if (!sent) {
        await updateSubscription(sub._id.toString(), { lastVideoId: prevId || '', lastVideoAt: lastAt }).catch(() => {});
        return res.json({ found: false, error: 'Sending to Discord failed.' });
      }
      return res.json({ found: true, sent, platform: 'youtube', title: video.title, url: video.url });
    }

    if (sub.platform === 'kick') {
      const result = await fetchKickStream(sub.channelId);
      if (result.status === 'error') return res.json({ found: false, error: 'Could not read the Kick stream: ' + result.message });
      if (result.status === 'offline') return res.json({ found: false, offline: true, message: 'The channel is offline right now — no live stream. A notification will be sent automatically when it goes live.' });
      const stream = result.stream;
      if (sub.lastStreamId === stream.id) return res.json({ found: false, message: 'No new stream.' });
      const sent = await sendNotification(client, sub, kickEmbed(stream));
      if (sent) await updateSubscription(sub._id.toString(), { lastStreamStatus: true, lastStreamId: stream.id });
      return res.json({ found: true, sent, platform: 'kick', title: stream.title, url: stream.url });
    }

    if (sub.platform === 'twitter') {
      const tweet = await fetchLatestTweet(sub.channelId);
      if (!tweet) return res.json({ found: false, error: 'Could not read the latest post.' });
      if (sub.lastVideoId === tweet.tweetId) return res.json({ found: false, message: 'No new post.' });
      const sent = await sendNotification(client, sub, twitterEmbed(tweet));
      if (sent) await updateSubscription(sub._id.toString(), { lastVideoId: tweet.tweetId });
      return res.json({ found: true, sent, platform: 'twitter', text: tweet.text?.slice(0, 100), url: tweet.url });
    }

    res.json({ error: 'Unsupported platform' });
  });

  app.post('/api/notifications/resend/:id', async (req, res) => {
    const { getSubscription, updateSubscription } = await import('./data/notificationDB.js');
    const { fetchLatestYouTubeVideo, fetchKickStream, fetchLatestTweet, youtubeEmbed, kickEmbed, twitterEmbed } = await import('./handlers/notificationMonitor.js');
    const { sendNotification } = await import('./handlers/notificationMonitor.js');
    const sub = getSubscription(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    if (sub.platform === 'youtube') {
      const video = await fetchLatestYouTubeVideo(sub.channelId);
      if (!video) return res.json({ sent: false, error: 'Could not read the YouTube RSS feed' });
      const sent = await sendNotification(client, sub, youtubeEmbed(video));
      if (sent) await updateSubscription(sub._id.toString(), { lastVideoId: video.videoId, channelName: video.channelName || sub.channelName });
      return res.json({ sent, platform: 'youtube', title: video.title, url: video.url });
    }

    if (sub.platform === 'kick') {
      const result = await fetchKickStream(sub.channelId);
      if (result.status === 'error') return res.json({ sent: false, error: 'Could not read the Kick stream: ' + result.message });
      if (result.status === 'offline') return res.json({ sent: false, offline: true, message: 'The channel is offline right now — a notification will be sent automatically when it goes live.' });
      const stream = result.stream;
      const sent = await sendNotification(client, sub, kickEmbed(stream));
      if (sent) await updateSubscription(sub._id.toString(), { lastStreamStatus: true, lastStreamId: stream.id });
      return res.json({ sent, platform: 'kick', title: stream.title, url: stream.url });
    }

    if (sub.platform === 'twitter') {
      const tweet = await fetchLatestTweet(sub.channelId);
      if (!tweet) return res.json({ sent: false, error: 'Could not read the latest post.' });
      const sent = await sendNotification(client, sub, twitterEmbed(tweet));
      if (sent) await updateSubscription(sub._id.toString(), { lastVideoId: tweet.tweetId });
      return res.json({ sent, platform: 'twitter', text: tweet.text?.slice(0, 100), url: tweet.url });
    }

    res.json({ error: 'Unsupported platform' });
  });

  app.get('/api/notifications/debug/:guildId', async (req, res) => {
    const { getSubscriptions } = await import('./data/notificationDB.js');
    const { getAllSubscriptions } = await import('./data/notificationDB.js');
    const { fetchLatestYouTubeVideo } = await import('./handlers/notificationMonitor.js');
    const subs = getSubscriptions(req.params.guildId).filter(s => s.platform === 'youtube');
    if (subs.length === 0) return res.json({ error: 'No YouTube subs' });
    const allYouTube = getAllSubscriptions().filter(s => s.platform === 'youtube');
    const results = [];
    for (const sub of allYouTube) {
      const rssVideo = await fetchLatestYouTubeVideo(sub.channelId).catch(() => null);
      results.push({
        _id: sub._id,
        guildId: sub.guildId,
        channelUrl: sub.channelUrl,
        channelId: sub.channelId,
        channelName: sub.channelName,
        lastVideoId: sub.lastVideoId || '(empty)',
        discordChannelId: sub.discordChannelId,
        rssVideoId: rssVideo?.videoId || null,
        rssTitle: rssVideo?.title || null,
        wouldNotify: !!(rssVideo && sub.lastVideoId && rssVideo.videoId !== sub.lastVideoId),
      });
    }
    res.json({ subs: results, allYouTubeCount: allYouTube.length });
  });

  // ── Send announcement from dashboard ─────────────────────────────────
  app.post('/api/announce', async (req, res) => {
    const { guildId, channelId, title, message, mention, color, image, thumbnail, footer, type, timestamp } = req.body;
    if (!guildId || !channelId || !title || !message) {
      return res.status(400).json({ error: 'Missing guildId, channelId, title, or message' });
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });

    const ANNOUNCE_TYPES = {
      general:     { emoji: '📢', label: 'Announcement', color: 0x1a6fff },
      maintenance: { emoji: '🔧', label: 'Maintenance',  color: 0xff9800 },
      update:      { emoji: '✅', label: 'Update',       color: 0x00c853 },
      warning:     { emoji: '🚨', label: 'Warning',      color: 0xe53935 },
      rules:       { emoji: '📋', label: 'Rules',        color: 0x7c4dff },
    };
    const ANNOUNCE_COLORS = { blue: 0x1a6fff, red: 0xe53935, gold: 0xffd700, green: 0x00c853, black: 0x0d0d0d, purple: 0x7c4dff, orange: 0xff9800 };
    const typeInfo = ANNOUNCE_TYPES[type] ?? ANNOUNCE_TYPES.general;
    const finalColor = ANNOUNCE_COLORS[color] ?? typeInfo.color;

    const embed = new EmbedBuilder()
      .setColor(finalColor)
      .setAuthor({ name: `${guild.name} • ${typeInfo.label}`, iconURL: guild.iconURL() || undefined })
      .setTitle(`${typeInfo.emoji}  ${title}`)
      .setDescription(`> Official ${typeInfo.label.toLowerCase()} from the **${guild.name}** team\n\n${message}`)
      .addFields(
        { name: '📋 Type', value: typeInfo.label, inline: true },
        { name: '📅 Date', value: `<t:${Math.floor(Date.now() / 1000)}:D>`, inline: true },
      );
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    embed.setFooter({ text: footer ?? `${guild.name} • ${typeInfo.label}`, iconURL: guild.iconURL() || undefined });
    if (timestamp !== false) embed.setTimestamp();

    let content;
    if (mention === "everyone") content = "@everyone";
    else if (mention === "here") content = "@here";

    await ch.send({ content, embeds: [embed] });
    res.json({ success: true, channel: ch.name });
  });

  // Maintenance mode status for dashboard sync
  app.get('/api/maintenance', async (req, res) => {
    try {
      const Maintenance = (await import('./models/Maintenance.js')).default;
      const doc = await Maintenance.findOne().lean();
      // Before the dashboard ever saved the bot half, an old doc only had the
      // site's `enabled`; fall back to it so the badge matches the gate.
      const botEnabled = doc ? (doc.botEnabled === undefined ? !!doc.enabled : !!doc.botEnabled) : false;
      const botEndTime = doc ? (doc.botEndTime === undefined ? doc.endTime : doc.botEndTime) : null;
      const botMessage = doc ? (doc.botMessage || doc.message || '') : '';
      if (botEnabled && botEndTime && Date.now() >= botEndTime) {
        await Maintenance.updateOne({ _id: doc._id }, { $set: { botEnabled: false, botEndTime: null, botDurationMinutes: 0 } });
        clearMaintenancePresence(client);
        return res.json({ enabled: false, botEnabled: false });
      }
      res.json({
        enabled: botEnabled,
        botEnabled,
        message: botMessage,
        endTime: botEndTime,
      });
    } catch { res.json({ enabled: false, botEnabled: false }); }
  });

  let lastStopTime = 0;

  app.post('/api/maintenance/sync', async (req, res) => {
    try {
      const Maintenance = (await import('./models/Maintenance.js')).default;
      const { action, channelId, changelog, message, endTime, durationMinutes } = req.body || {};

      console.log(`[Maintenance/Sync] action=${action || 'update'} channelId=${channelId}`);

      const set = {};
      if (typeof channelId === 'string' && channelId) set.channelId = channelId;
      if (typeof message === 'string' && message) set.botMessage = message;
      if (endTime === null || typeof endTime === 'number') set.botEndTime = endTime ?? null;
      if (typeof durationMinutes === 'number') set.botDurationMinutes = durationMinutes;
      if (changelog) {
        set.changelog = {
          botUpdates: (changelog.botUpdates || '').trim() || 'No updates recorded',
          siteUpdates: (changelog.siteUpdates || '').trim() || 'No updates recorded',
        };
      }

      if (action === 'start') {
        lastStopTime = 0;
        set.botEnabled = true;
        set.botStartedAt = Date.now();
        set.changelog = { botUpdates: '', siteUpdates: '' };
        await Maintenance.updateOne({}, { $set: set }, { upsert: true });
        const doc = await Maintenance.findOne().lean();
        setMaintenancePresence(client, doc?.botMessage || 'The bot is under maintenance');
        const target = channelId || doc?.channelId || '';
        console.log(`[Maintenance/Sync] Sending the start notice to ${target}`);
        if (target) await sendMaintenanceStart(client, target, doc?.botMessage, doc?.botEndTime);
        return res.json({ synced: true, enabled: true });
      }

      if (action === 'stop') {
        const elapsed = typeof req.body?.elapsedMinutes === 'number' ? req.body.elapsedMinutes : 0;
        set.botEnabled = false;
        set.botEndTime = null;
        set.botDurationMinutes = 0;
        await Maintenance.updateOne({}, { $set: set }, { upsert: true });
        clearMaintenancePresence(client);
        const now = Date.now();
        if (now - lastStopTime < 15000) {
          console.log(`[Maintenance/Sync] Skipping the end notice — already sent ${Math.round((now - lastStopTime) / 1000)}s ago`);
        } else {
          lastStopTime = now;
          const doc = await Maintenance.findOne().lean();
          const target = channelId || doc?.channelId || '';
          const cl = doc?.changelog || { botUpdates: 'No updates recorded', siteUpdates: 'No updates recorded' };
          console.log(`[Maintenance/Sync] Sending the end notice to ${target}`);
          if (target) await sendMaintenanceEnd(client, target, elapsed, cl);
        }
        return res.json({ synced: true, enabled: false });
      }

      // 'update' (or no action): persist settings, then reconcile presence and
      // auto-expiry against the bot's own half.
      await Maintenance.updateOne({}, { $set: set }, { upsert: true });
      const doc = await Maintenance.findOne().lean();
      if (doc?.botEnabled) {
        if (doc.botEndTime && Date.now() >= doc.botEndTime) {
          await Maintenance.updateOne({ _id: doc._id }, { $set: { botEnabled: false, botEndTime: null, botDurationMinutes: 0 } });
          clearMaintenancePresence(client);
          const now = Date.now();
          if (now - lastStopTime >= 15000) {
            lastStopTime = now;
            const target = doc.channelId || '';
            if (target) await sendMaintenanceEnd(client, target, doc.botDurationMinutes || 0);
          }
        } else {
          setMaintenancePresence(client, doc.botMessage || 'The bot is under maintenance');
        }
      } else {
        clearMaintenancePresence(client);
      }
      return res.json({ synced: true, enabled: !!doc?.botEnabled });
    } catch (err) {
      console.error('[Maintenance/Sync] Error:', err.message);
      res.json({ synced: false, error: err.message });
    }
  });

  // Single user info from bot cache
  app.get('/api/users/:userId', async (req, res) => {
    let user = client.users.cache.get(req.params.userId);
    if (!user) {
      try {
        user = await client.users.fetch(req.params.userId, { force: true });
      } catch {
        return res.status(404).json({ error: 'User not found' });
      }
    }
    res.json({ id: user.id, username: user.username, globalName: user.globalName, avatar: user.avatar });
  });

  // Send setup message when a restricted channel is added from dashboard
  app.post('/api/restricted-channel-setup', async (req, res) => {
    const { guildId, channelId } = req.body;
    if (!guildId || !channelId) return res.status(400).json({ error: 'Missing guildId or channelId' });
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    try {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (!ch) return res.status(404).json({ error: 'Channel not found' });
      const setupEmbed = notice({
        title: '🚫 This channel is restricted',
        color: C.error,
        description: 'Anyone who sends a message here is **banned from the server for 24 hours**, '
          + 'with no exceptions (the owner and the bot are exempt).',
        fields: [
          field('Why it is restricted', [
            '• Protects members from malicious links and scams',
            '• Prevents inappropriate content',
            '• Keeps the server and its members private',
            '• Keeps sensitive channels under control',
          ].join('\n'), false),
          field('What happens on a violation', [
            '• The message is deleted immediately',
            '• The member is banned for 24 hours and their messages are removed',
            '• The staff team is notified',
            '• The member receives a DM explaining why',
          ].join('\n'), false),
        ],
        footer: '⚔️ KRS-SYS • Automatic protection',
        timestamp: true,
      });
      await ch.send({ embeds: [setupEmbed] });
      res.json({ success: true, message: 'Setup message sent' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore ticket panels
  const { restoreAllPanels } = await import('./handlers/ticketHandler.js');
  await restoreAllPanels(client);

  // Refresh a single guild's panels (tickets + voice) — used when dashboard changes panel images
  app.post('/api/panels/refresh', async (req, res) => {
    const { guildId } = req.body || {};
    if (!guildId) return res.status(400).json({ error: 'Missing guildId' });
    try {
      const { refreshGuildPanel } = await import('./handlers/ticketHandler.js');
      const { refreshPanel } = await import('./handlers/tempVoice.js');
      const ticket = await refreshGuildPanel(client, guildId);
      const voice = await refreshPanel(client, guildId).catch(() => false);
      res.json({ success: true, ticket, voice });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore temp voice panels
  const { refreshPanel } = await import('./handlers/tempVoice.js');
  const { getAllSetups } = await import('./handlers/tempVoice.js');
  for (const [guildId] of getAllSetups()) {
    await refreshPanel(client, guildId);
  }

  // Temp Voice: panel refresh every 30 minutes
  setInterval(async () => {
    console.log('[TempVC] 🔄 Running 30-min panel refresh...');
    for (const [guildId] of getAllSetups()) {
      await refreshPanel(client, guildId);
    }
  }, 30 * 60 * 1000);

  // Ticket: inactivity monitor
  const { startInactivityMonitor } = await import('./handlers/inactivityHandler.js');
  startInactivityMonitor(client);

  // Bot logger: send online status + start heartbeat
  sendOnlineLog();
  startHeartbeat();

  // Notification: start monitor
  const { startNotificationMonitor } = await import('./handlers/notificationMonitor.js');
  startNotificationMonitor(client);

  async function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Shutting down…`);
    try {
      await sendOfflineLog(`Signal ${signal}`);
    } catch (e) {
      console.error('Failed to send offline log');
    }
    client.destroy();
    process.exit(0);
  }

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    console.error('[UnhandledRejection]', err);
    sendErrorLog('Unhandled promise rejection', err).catch(() => {});
  });
  process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err);
    sendErrorLog('Uncaught exception', err).catch(() => {});
  });
  // ── Periodic maintenance expiry check (every 15 seconds) ─────────────
  setInterval(async () => {
    try {
      const Maintenance = (await import('./models/Maintenance.js')).default;
      const doc = await Maintenance.findOne().lean();
      if (doc && doc.botEnabled && doc.botEndTime && Date.now() >= doc.botEndTime) {
        await Maintenance.updateOne({ _id: doc._id }, { $set: { botEnabled: false, botEndTime: null, botDurationMinutes: 0 } });
        clearMaintenancePresence(client);
        const target = doc.channelId || '';
        if (target) await sendMaintenanceEnd(client, target, doc.botDurationMinutes || 0);
        console.log('[Maintenance] Duration elapsed automatically — bot maintenance disabled');
      }
    } catch (err) {
      console.error('[Maintenance] Error during the periodic check:', err.message);
    }
  }, 15_000);
});

// ─── Login ─────────────────────────────────────────────────────────────────
if (!process.env.TOKEN) {
  console.error('❌ Missing TOKEN in .env');
  process.exit(1);
}

client.login(process.env.TOKEN);
