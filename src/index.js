import { Client, Collection, GatewayIntentBits, Partials, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { readdir } from 'fs/promises';
import { readFileSync, statSync, readdirSync, existsSync, writeFileSync, createReadStream } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import 'dotenv/config';
import { initBotLogger, sendOnlineLog, sendOfflineLog, sendErrorLog, startHeartbeat } from './utils/botLogger.js';
import { startPresenceRotation, setMaintenancePresence, clearMaintenancePresence } from './utils/presence.js';
import { sendMaintenanceStart, sendMaintenanceEnd } from './utils/maintenanceEmbed.js';
import express from 'express';
import { loadFromDisk, cleanStaleChannels } from './handlers/tempVoice.js';
import { loadAllData } from './data/ticketDB.js';
import { loadAllSubscriptions } from './data/notificationDB.js';

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

// يعيد الصور الافتراضية الثلاث (ترحيب / بنل تذاكر / بنل صوتيات) ليستعرضها الداشبورد
// عبر زر «عرض الصورة الحالية» عندما لا تكون هناك صورة مخصصة للسيرفر.
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
        // جلب صورة الترحيب الافتراضية من الرابط الأصل وتخزينها مؤقتاً
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
  // rather than 0 so the UI can say "غير متاح" instead of claiming "0ms".
  const wsPing = client.ws?.ping;
  const ping = ready && Number.isFinite(wsPing) && wsPing > 0 ? Math.round(wsPing) : null;

  res.json({ online: ready, guilds, members, ping });
});

// Bot guild IDs for dashboard (to filter guilds where the bot is present)
app.get('/api/guilds', (req, res) => {
  const guildIds = client.isReady() ? client.guilds.cache.map(g => String(g.id)) : [];
  res.json({ guilds: guildIds, count: guildIds.length });
});

// Command statistics for dashboard (real count from source folders)
app.get('/api/commands/stats', (req, res) => {
  const commandsDir = path.join(__dirname, 'commands');
  const perCategory = {};
  let total = 0;
  try {
    const cats = readdirSync(commandsDir);
    for (const cat of cats) {
      const catPath = path.join(commandsDir, cat);
      if (!statSync(catPath).isDirectory()) continue;
      const files = readdirSync(catPath).filter(f => f.endsWith('.js'));
      let count = 0;
      for (const file of files) {
        try {
          const content = readFileSync(path.join(catPath, file), 'utf-8');
          if (/\.setName\(['"`]/.test(content)) count++;
        } catch {}
      }
      if (count > 0) { perCategory[cat] = count; total += count; }
    }
  } catch {}
  res.json({ total, categories: Object.keys(perCategory), perCategory });
});

client.commands = new Collection();

// ─── Load Commands from ALL directories ───────────────────────────────────
const commandDirs = [
  path.join(__dirname, 'commands', 'setup'),
  path.join(__dirname, 'commands', 'moderation'),
  path.join(__dirname, 'commands', 'info'),
  path.join(__dirname, 'commands', 'members'),
  path.join(__dirname, 'commands', 'ticket'),
  path.join(__dirname, 'commands', 'voice'),
  path.join(__dirname, 'commands', 'notifications'),
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
await Promise.all([loadFromDisk(), loadAllData(), loadAllSubscriptions()]);

// ─── Load DB Configs ──────────────────────────────────────────────────────
const { loadCommandConfigsFromDB, loadConfigsFromDB } = await import('./database.js');
await Promise.all([loadCommandConfigsFromDB(), loadConfigsFromDB()]);

// Periodic reload of command configs + guild configs (picks up dashboard changes)
setInterval(() => loadCommandConfigsFromDB(), 5000);
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
    const commandsDir = path.join(__dirname, 'commands');
    const list = [];
    try {
      const cats = readdirSync(commandsDir);
      for (const cat of cats) {
        const catPath = path.join(commandsDir, cat);
        if (!statSync(catPath).isDirectory()) continue;
        const files = readdirSync(catPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
          try {
            const mod = await import(pathToFileURL(path.join(catPath, file)).href);
            if (mod.data && mod.data.name) {
              list.push({
                name: mod.data.name,
                description: mod.data.description || '',
                category: cat,
                file,
                options: mod.data.options || [],
              });
            }
          } catch {}
        }
      }
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
      if (!channel) return res.status(403).json({ error: 'لا يوجد روم نصي يمكن إنشاء دعوة فيه' });
      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, reason: 'Kratos Dashboard — dev page join link' });
      const url = `https://discord.gg/${invite.code}`;
      inviteCache.set(guild.id, { url, code: invite.code, channelId: channel.id, ts: Date.now() });
      res.json({ url, code: invite.code, channelId: channel.id, cached: false });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'فشل إنشاء الدعوة' });
    }
  });

  // Guild info for dashboard (member count without listing members)
  app.get('/api/guilds/:guildId/info', (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    res.json({ id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.memberCount });
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
      return res.status(400).json({ error: 'تعذر التعرف على قناة يوتيوب من هذا الرابط — تأكد من صحة الرابط (مثال: https://youtube.com/@username)' });
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
      if (!video) return res.json({ found: false, error: 'تعذر جلب الفيديو من RSS' });
      const lastAt = Number(sub.lastVideoAt) || 0;
      if (lastAt > 0 && Number(video.publishedAt) <= lastAt) {
        return res.json({ found: false, message: 'لا يوجد فيديو جديد أحدث من الفيديو المُرسل مسبقاً' });
      }
      const prevId = sub.lastVideoId;
      const claimed = await claimYouTubeVideo(sub._id.toString(), video);
      if (!claimed) return res.json({ found: false, message: 'هذا الفيديو تم إرساله مسبقاً (بدون تكرار)' });
      const sent = await sendNotification(client, sub, youtubeEmbed(video));
      if (!sent) {
        await updateSubscription(sub._id.toString(), { lastVideoId: prevId || '', lastVideoAt: lastAt }).catch(() => {});
        return res.json({ found: false, error: 'فشل الإرسال إلى ديسكورد' });
      }
      return res.json({ found: true, sent, platform: 'youtube', title: video.title, url: video.url });
    }

    if (sub.platform === 'kick') {
      const result = await fetchKickStream(sub.channelId);
      if (result.status === 'error') return res.json({ found: false, error: 'تعذر جلب البث من Kick: ' + result.message });
      if (result.status === 'offline') return res.json({ found: false, offline: true, message: 'القناة غير متصلة حالياً — لا يوجد بث مباشر. سيرسل إشعار تلقائياً عند دخولها للبث' });
      const stream = result.stream;
      if (sub.lastStreamId === stream.id) return res.json({ found: false, message: 'لا يوجد بث جديد' });
      const sent = await sendNotification(client, sub, kickEmbed(stream));
      if (sent) await updateSubscription(sub._id.toString(), { lastStreamStatus: true, lastStreamId: stream.id });
      return res.json({ found: true, sent, platform: 'kick', title: stream.title, url: stream.url });
    }

    if (sub.platform === 'twitter') {
      const tweet = await fetchLatestTweet(sub.channelId);
      if (!tweet) return res.json({ found: false, error: 'تعذر جلب التغريدة' });
      if (sub.lastVideoId === tweet.tweetId) return res.json({ found: false, message: 'لا يوجد تغريدة جديدة' });
      const sent = await sendNotification(client, sub, twitterEmbed(tweet));
      if (sent) await updateSubscription(sub._id.toString(), { lastVideoId: tweet.tweetId });
      return res.json({ found: true, sent, platform: 'twitter', text: tweet.text?.slice(0, 100), url: tweet.url });
    }

    res.json({ error: 'منصة غير مدعومة' });
  });

  app.post('/api/notifications/resend/:id', async (req, res) => {
    const { getSubscription, updateSubscription } = await import('./data/notificationDB.js');
    const { fetchLatestYouTubeVideo, fetchKickStream, fetchLatestTweet, youtubeEmbed, kickEmbed, twitterEmbed } = await import('./handlers/notificationMonitor.js');
    const { sendNotification } = await import('./handlers/notificationMonitor.js');
    const sub = getSubscription(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    if (sub.platform === 'youtube') {
      const video = await fetchLatestYouTubeVideo(sub.channelId);
      if (!video) return res.json({ sent: false, error: 'تعذر جلب الفيديو من RSS' });
      const sent = await sendNotification(client, sub, youtubeEmbed(video));
      if (sent) await updateSubscription(sub._id.toString(), { lastVideoId: video.videoId, channelName: video.channelName || sub.channelName });
      return res.json({ sent, platform: 'youtube', title: video.title, url: video.url });
    }

    if (sub.platform === 'kick') {
      const result = await fetchKickStream(sub.channelId);
      if (result.status === 'error') return res.json({ sent: false, error: 'تعذر جلب البث من Kick: ' + result.message });
      if (result.status === 'offline') return res.json({ sent: false, offline: true, message: 'القناة غير متصلة حالياً — سيرسل إشعار تلقائياً عند دخولها للبث' });
      const stream = result.stream;
      const sent = await sendNotification(client, sub, kickEmbed(stream));
      if (sent) await updateSubscription(sub._id.toString(), { lastStreamStatus: true, lastStreamId: stream.id });
      return res.json({ sent, platform: 'kick', title: stream.title, url: stream.url });
    }

    if (sub.platform === 'twitter') {
      const tweet = await fetchLatestTweet(sub.channelId);
      if (!tweet) return res.json({ sent: false, error: 'تعذر جلب التغريدة' });
      const sent = await sendNotification(client, sub, twitterEmbed(tweet));
      if (sent) await updateSubscription(sub._id.toString(), { lastVideoId: tweet.tweetId });
      return res.json({ sent, platform: 'twitter', text: tweet.text?.slice(0, 100), url: tweet.url });
    }

    res.json({ error: 'منصة غير مدعومة' });
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
      general:     { emoji: "📢", label: "إعلان عام",     color: 0x1a6fff },
      maintenance: { emoji: "🔧", label: "صيانة",          color: 0xff9800 },
      update:      { emoji: "✅", label: "تحديث/إصدار",    color: 0x00c853 },
      warning:     { emoji: "🚨", label: "تحذير",          color: 0xe53935 },
      rules:       { emoji: "📋", label: "قواعد",          color: 0x7c4dff },
    };
    const ANNOUNCE_COLORS = { blue: 0x1a6fff, red: 0xe53935, gold: 0xffd700, green: 0x00c853, black: 0x0d0d0d, purple: 0x7c4dff, orange: 0xff9800 };
    const typeInfo = ANNOUNCE_TYPES[type] ?? ANNOUNCE_TYPES.general;
    const finalColor = ANNOUNCE_COLORS[color] ?? typeInfo.color;

    const embed = new EmbedBuilder()
      .setColor(finalColor)
      .setAuthor({ name: `${guild.name} • ${typeInfo.label}`, iconURL: guild.iconURL() || undefined })
      .setTitle(`${typeInfo.emoji}  ${title}`)
      .setDescription([`> ${typeInfo.label} رسمي من إدارة **${guild.name}**`, '', '━━━━━━━━━━━━━━━━━━━━━━━━━━', '', message, '', '━━━━━━━━━━━━━━━━━━━━━━━━━━'].join("\n"))
      .addFields(
        { name: '📋 النوع', value: typeInfo.label, inline: true },
        { name: '📅 التاريخ', value: `<t:${Math.floor(Date.now() / 1000)}:D>`, inline: true },
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
      if (doc && doc.enabled && doc.endTime && Date.now() >= doc.endTime) {
        await Maintenance.updateOne({ _id: doc._id }, { $set: { enabled: false, endTime: null, durationMinutes: 0 } });
        clearMaintenancePresence(client);
        return res.json({ enabled: false });
      }
      res.json({ enabled: doc?.enabled || false, message: doc?.message || '', endTime: doc?.endTime || null });
    } catch { res.json({ enabled: false }); }
  });

  let lastStopTime = 0;

  app.post('/api/maintenance/sync', async (req, res) => {
    try {
      const Maintenance = (await import('./models/Maintenance.js')).default;
      const { action, channelId, changelog } = req.body || {};

      console.log(`[Maintenance/Sync] action=${action} channelId=${channelId}`);

      if (channelId) {
        await Maintenance.updateOne({}, { $set: { channelId } }, { upsert: true });
      }

      if (changelog) {
        const botUpdates = (changelog.botUpdates || '').trim() || 'لم يتم إضافة تحديثات';
        const siteUpdates = (changelog.siteUpdates || '').trim() || 'لم يتم إضافة تحديثات';
        await Maintenance.updateOne({}, { $set: { changelog: { botUpdates, siteUpdates } } }, { upsert: true });
      }

      let doc = await Maintenance.findOne().lean();

      if (!doc) {
        doc = { enabled: false, message: '', channelId: '', endTime: null, durationMinutes: 0, changelog: { botUpdates: '', siteUpdates: '' }, _id: null };
      }

      if (action === 'start') {
        lastStopTime = 0;
        await Maintenance.updateOne({}, { $set: { changelog: { botUpdates: '', siteUpdates: '' } } }, { upsert: true });
        setMaintenancePresence(client, doc.message || 'البوت تحت الصيانة');
        const target = channelId || doc.channelId || '';
        console.log(`[Maintenance/Sync] إرسال إشعار البدء إلى ${target}`);
        if (target) await sendMaintenanceStart(client, target, doc.message, doc.endTime);
      } else if (action === 'stop') {
        clearMaintenancePresence(client);
        const now = Date.now();
        if (now - lastStopTime < 15000) {
          console.log(`[Maintenance/Sync] تخطي إشعار الانتهاء — تم إرساله قبل ${(now - lastStopTime) / 1000} ث`);
        } else {
          lastStopTime = now;
          const target = channelId || doc.channelId || '';
          const cl = doc.changelog || { botUpdates: 'لم يتم إضافة تحديثات', siteUpdates: 'لم يتم إضافة تحديثات' };
          console.log(`[Maintenance/Sync] إرسال إشعار الانتهاء إلى ${target}`);
          if (target) await sendMaintenanceEnd(client, target, doc.durationMinutes || 0, cl);
        }
      } else {
        if (doc.enabled) {
          if (doc.endTime && Date.now() >= doc.endTime) {
            await Maintenance.updateOne({ _id: doc._id }, { $set: { enabled: false, endTime: null, durationMinutes: 0 } });
            clearMaintenancePresence(client);
            const now = Date.now();
            if (now - lastStopTime >= 15000) {
              lastStopTime = now;
              const target = doc.channelId || '';
              if (target) await sendMaintenanceEnd(client, target, doc.durationMinutes || 0);
            }
          } else {
            setMaintenancePresence(client, doc.message || 'البوت تحت الصيانة');
          }
        } else {
          clearMaintenancePresence(client);
        }
      }
    } catch (err) {
      console.error('[Maintenance/Sync] خطأ:', err.message);
    }
    res.json({ synced: true });
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
      const setupEmbed = new EmbedBuilder()
        .setColor(0x8b0000)
        .setTitle('🚫 تم تفعيل نظام الرومات المحضورة')
        .setDescription([
          '### ⚠️ هذه القناة مصنفة كـ **روم محضور**',
          '',
          '> **ما معنى روم محضور؟**',
          '> أي شخص يرسل رسالة في هذه القناة سيتم **حظره تلقائياً**',
          '> من السيرفر لمدة **24 ساعة** دون استثناء (عدا المالك والبوت).',
          '',
          '> **لماذا هذه القناة محضورة؟**',
          '> • لحماية الأعضاء من الروابط الضارة والاحتيال',
          '> • منع نشر محتوى غير لائق',
          '> • حفظ خصوصية السيرفر وأعضائه',
          '> • للتحكم في القنوات الحساسة',
          '',
          '> **ماذا يحدث عند المخالفة؟**',
          '> • يتم حذف الرسالة فوراً',
          '> • حظر العضو لمدة 24 ساعة مع مسح رسائله',
          '> • إرسال إشعار للإدارة',
          '> • إرسال رسالة خاصة للعضو توضيحاً للسبب',
          '',
          '```diff',
          '- يرجى احترام هذه القناة وعدم الكتابة فيها',
          '```',
          '',
          '> 🛡️ *نظام الحماية التلقائية — KRS-SYS*',
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: '⚔️ KRS-SYS  •  الحماية التلقائية' });
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
  // ── Periodic maintenance expiry check (every 15 seconds) ─────────────
  setInterval(async () => {
    try {
      const Maintenance = (await import('./models/Maintenance.js')).default;
      const doc = await Maintenance.findOne().lean();
      if (doc && doc.enabled && doc.endTime && Date.now() >= doc.endTime) {
        await Maintenance.updateOne({ _id: doc._id }, { $set: { enabled: false, endTime: null, durationMinutes: 0 } });
        clearMaintenancePresence(client);
        const target = doc.channelId || '';
        if (target) await sendMaintenanceEnd(client, target, doc.durationMinutes || 0);
        console.log('[Maintenance] انتهت مدة الصيانة تلقائياً — تم إيقافها');
      }
    } catch (err) {
      console.error('[Maintenance] خطأ في التحقق الدوري:', err.message);
    }
  }, 15_000);
});

// ─── Login ─────────────────────────────────────────────────────────────────
if (!process.env.TOKEN) {
  console.error('❌ Missing TOKEN in .env');
  process.exit(1);
}

client.login(process.env.TOKEN);
