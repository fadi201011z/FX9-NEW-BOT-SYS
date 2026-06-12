import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import 'dotenv/config';
import { initBotLogger, sendOfflineLog, sendErrorLog } from './utils/botLogger.js';
import express from 'express';
import { loadFromDisk, cleanStaleChannels } from './handlers/tempVoice.js';
import { loadAllData } from './data/ticketDB.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Express Server (Keep-Alive) ──────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT) || 10000;

app.get('/', (req, res) => res.send('FX9 Merged Bot is Online! ✅'));
app.use(express.json());

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

client.commands = new Collection();
client.musicQueues = new Map();

// ─── Load Commands from ALL directories ───────────────────────────────────
const commandDirs = [
  path.join(__dirname, 'commands', 'setup'),
  path.join(__dirname, 'commands', 'moderation'),
  path.join(__dirname, 'commands', 'info'),
  path.join(__dirname, 'commands', 'members'),
  path.join(__dirname, 'commands', 'ticket'),
  path.join(__dirname, 'commands', 'voice'),
];

for (const dir of commandDirs) {
  let files;
  try { files = (await readdir(dir)).filter(f => f.endsWith('.js') || f.endsWith('.ts')); }
  catch { continue; }
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    if (mod.data && mod.execute) {
      client.commands.set(mod.data.name, mod);
      console.log(`  [CMD] /${mod.data.name}`);
    }
  }
}

// ─── Load Events ──────────────────────────────────────────────────────────
const eventsDir  = path.join(__dirname, 'events');
const eventFiles = (await readdir(eventsDir)).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = await import(pathToFileURL(path.join(eventsDir, file)).href);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`  [EVT] ${event.name}`);
}

// ─── Load Persistent Data ──────────────────────────────────────────────────
await Promise.all([loadFromDisk(), loadAllData()]);

// ─── Load DB Configs ──────────────────────────────────────────────────────
const { loadCommandConfigsFromDB, loadConfigsFromDB } = await import('./database.js');
await Promise.all([loadCommandConfigsFromDB(), loadConfigsFromDB()]);

// Periodic reload of command configs (picks up dashboard changes)
setInterval(() => loadCommandConfigsFromDB(), 5000);

// ─── Ready Handler ─────────────────────────────────────────────────────────
client.once('ready', async () => {
  initBotLogger(client);
  console.log(`[SYSTEM] Authorized: ${client.user.tag}`);

  // Clean stale temp voice channels
  await cleanStaleChannels(client);

  // Bot stats endpoint for dashboard
  app.get('/api/stats', (req, res) => {
    const guilds = client.guilds.cache.size;
    const members = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
    const ping = client.ws.ping;
    res.json({ guilds, members, ping });
  });

  // Guild roles with member counts for dashboard
  app.get('/api/guilds/:guildId/roles', (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
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
      members_count: r.members.size,
    }));
    res.json(roles);
  });

  // Guild members (fetches all via Gateway to populate cache)
  app.get('/api/guilds/:guildId/members', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    try { await guild.members.fetch(); } catch {}
    const members = guild.members.cache.map(m => ({
      id: m.user.id,
      username: m.user.username,
      globalName: m.user.globalName,
      displayName: m.displayName,
      avatar: m.user.avatar,
      roles: m.roles.cache.map(r => r.id),
    }));
    res.json(members);
  });

  // Guild members filtered by role IDs (fetches all via Gateway)
  app.get('/api/guilds/:guildId/members-by-roles', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const roleIds = req.query.roleIds ? req.query.roleIds.split(',') : [];
    try { await guild.members.fetch(); } catch {}
    const members = guild.members.cache
      .filter(m => m.roles.cache.some(r => roleIds.includes(r.id)))
      .map(m => ({
        id: m.user.id,
        username: m.user.username,
        globalName: m.user.globalName,
        displayName: m.displayName,
        avatar: m.user.avatar,
        roles: m.roles.cache.map(r => r.id),
      }));
    res.json(members);
  });

  // Single user info from bot cache
  app.get('/api/users/:userId', (req, res) => {
    const user = client.users.cache.get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, globalName: user.globalName, avatar: user.avatar });
  });

  // Restore ticket panels
  const { restoreAllPanels } = await import('./handlers/ticketHandler.js');
  await restoreAllPanels(client);

  // Restore temp voice panels
  const { refreshPanel } = await import('./handlers/tempVoice.js');
  const { getAllSetups } = await import('./handlers/tempVoice.js');
  for (const [guildId] of getAllSetups()) {
    await refreshPanel(client, guildId);
  }

  // Music: auto-update now playing embed
  const { updateNowPlayingEmbed } = await import('./handlers/music.js');
  setInterval(async () => {
    for (const [guildId] of client.musicQueues) {
      await updateNowPlayingEmbed(client, guildId);
    }
  }, 12_000);

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

  async function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Shutting down…`);
    try {
      await sendOfflineLog(`إشارة ${signal}`);
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
    sendErrorLog('Promise مرفوضة', err).catch(() => {});
  });
  process.on('uncaughtException', (err) => {
    console.error('[UncaughtException]', err);
    sendErrorLog('استثناء غير محلول', err).catch(() => {});
  });
});

// ─── Login ─────────────────────────────────────────────────────────────────
if (!process.env.TOKEN) {
  console.error('❌ Missing TOKEN in .env');
  process.exit(1);
}

client.login(process.env.TOKEN);
