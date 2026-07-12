import { Client, Collection, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import 'dotenv/config';
import { initBotLogger, sendOfflineLog, sendErrorLog } from './utils/botLogger.js';
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
setInterval(() => loadAllSubscriptions(), 15000);

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
    const { getSubscription, updateSubscription } = await import('./data/notificationDB.js');
    const { fetchLatestYouTubeVideo, youtubeEmbed } = await import('./handlers/notificationMonitor.js');
    const sub = getSubscription(req.params.id);
    if (!sub || sub.platform !== 'youtube') return res.status(404).json({ error: 'Not found or not YouTube' });
    const video = await fetchLatestYouTubeVideo(sub.channelId);
    if (!video) return res.json({ error: 'Could not fetch video from RSS' });
    try {
      const ch = await client.channels.fetch(sub.discordChannelId).catch(() => null);
      if (!ch) return res.json({ error: 'Discord channel not found' });
      const { sendNotification } = await import('./handlers/notificationMonitor.js');
      await sendNotification(client, sub, youtubeEmbed(video));
      await updateSubscription(sub._id.toString(), {
        lastVideoId: video.videoId,
        channelName: video.channelName || sub.channelName,
      });
      res.json({ success: true, videoId: video.videoId, title: video.title });
    } catch (err) {
      res.json({ error: err.message });
    }
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
  app.get('/api/users/:userId', (req, res) => {
    const user = client.users.cache.get(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
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
          '> 🛡️ *نظام الحماية التلقائية — FX9-SYS*',
        ].join('\n'))
        .setTimestamp()
        .setFooter({ text: '⚔️ FX9-SYS  •  الحماية التلقائية' });
      await ch.send({ embeds: [setupEmbed] });
      res.json({ success: true, message: 'Setup message sent' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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
});

// ─── Login ─────────────────────────────────────────────────────────────────
if (!process.env.TOKEN) {
  console.error('❌ Missing TOKEN in .env');
  process.exit(1);
}

client.login(process.env.TOKEN);
