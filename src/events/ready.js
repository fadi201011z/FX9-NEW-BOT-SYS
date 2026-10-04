import { Events, REST, Routes } from 'discord.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import { startPresenceRotation, setMaintenancePresence } from '../utils/presence.js';
import { sendMaintenanceStart } from '../utils/maintenanceEmbed.js';
import Maintenance from '../models/Maintenance.js';
import { sendOnlineLog, startHeartbeat } from '../utils/botLogger.js';
import { commandPayloads } from '../config/commandLoader.js';

export const name = Events.ClientReady;
export const once = true;

const STATS_INTERVAL = 60 * 1000;

export async function execute(client) {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║     Kratos System — Ready!           ║`);
  console.log(`╠════════════════════════════════════════╣`);
  console.log(`║  Tag:    ${client.user.tag.padEnd(30)}║`);
  console.log(`║  Guilds: ${String(client.guilds.cache.size).padEnd(30)}║`);
  console.log(`║  Commands: ${String(client.commands?.size ?? 0).padEnd(27)}║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  // ── Auto-register slash commands globally ────────────────────────────
  // Shared loader: same folder discovery as the runtime handler loader, so a
  // command can never be registered with Discord but left without a handler.
  const cmdData = await commandPayloads();
  if (cmdData.length > 0) {
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

      // Clear the global commands so they only show in the guilds the bot is in.
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] }).catch(() => {});

      // Register per-guild so the commands propagate immediately.
      let updated = 0;
      for (const [guildId] of client.guilds.cache) {
        try {
          await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: cmdData });
          updated++;
        } catch {}
      }
      console.log(`[Deploy] ✅ ${cmdData.length} command(s) registered for ${updated} guild(s)`);
    } catch (err) {
      console.error('[Deploy] ❌ Failed to register commands:', err.message);
    }
  }

  // ── SYS: Rotating presence ──────────────────────────────────────────
  startPresenceRotation(client);

  // ── Check maintenance at startup ────────────────────────────────────
  try {
    const doc = await Maintenance.findOne().lean();
    if (doc && doc.enabled) {
      if (doc.endTime && Date.now() >= doc.endTime) {
        await Maintenance.updateOne({ _id: doc._id }, { $set: { enabled: false, endTime: null, durationMinutes: 0 } });
      } else {
        setMaintenancePresence(client, doc.message || 'The bot is under maintenance');
        if (doc.channelId && !process.env.SUPPRESS_MAINTENANCE_EMBED) {
          await sendMaintenanceStart(client, doc.channelId, doc.message, doc.endTime);
        }
      }
    }
  } catch {}

  // ── SYS: Update status channels immediately ─────────────────────────
  for (const [, guild] of client.guilds.cache) {
    updateStatusChannels(guild).catch(() => { /* not configured yet */ });
  }

  // ── SYS: Status channel refresh every 60s ───────────────────────────
  setInterval(() => {
    for (const [, guild] of client.guilds.cache) {
      updateStatusChannels(guild).catch(() => {});
    }
  }, STATS_INTERVAL);

  // ── SYS: Online log + heartbeat ─────────────────────────────────────
  await sendOnlineLog();
  startHeartbeat();

  // ── VOICE: Clean stale temp voice channels ───────────────────────────
  const { cleanStaleChannels, getAllSetups, refreshPanel, getActiveCount, updatePanelMessageId, buildStatusPanel } = await import('../handlers/tempVoice.js');
  await cleanStaleChannels(client);

  // ── VOICE: Restore permanent panels ─────────────────────────────────
  for (const [guildId, setup] of getAllSetups()) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      const textCh = guild.channels.cache.get(setup.textChannelId);
      if (!textCh) continue;

      const count = getActiveCount(guildId);
      const panel = buildStatusPanel(guildId, setup, count);

      if (setup.panelMessageId) {
        const existing = await textCh.messages.fetch(setup.panelMessageId).catch(() => null);
        if (existing) {
          await existing.edit(panel).catch(() => {});
          console.log(`[TempVC] ✅ Panel restored for guild ${guildId}`);
          continue;
        }
      }

      const msg = await textCh.send(panel);
      updatePanelMessageId(guildId, msg.id);
      console.log(`[TempVC] ✅ New panel sent for guild ${guildId}`);
    } catch (err) {
      console.error(`[TempVC] ❌ Panel restore for ${guildId}:`, err.message);
    }
  }

  // ── VOICE: Refresh temp voice panels every 30 minutes ───────────────
  setInterval(async () => {
    console.log('[TempVC] 🔄 Running 30-min panel refresh...');
    for (const [guildId, setup] of getAllSetups()) {
      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const textCh = guild.channels.cache.get(setup.textChannelId);
        if (!textCh) continue;

        const count = getActiveCount(guildId);
        const panel = buildStatusPanel(guildId, setup, count);

        if (setup.panelMessageId) {
          const existing = await textCh.messages.fetch(setup.panelMessageId).catch(() => null);
          if (existing) {
            await existing.edit(panel).catch(() => {});
            continue;
          }
        }
        const msg = await textCh.send(panel);
        updatePanelMessageId(guildId, msg.id);
        console.log(`[TempVC] ✅ Panel re-sent for guild ${guildId}`);
      } catch (err) {
        console.error(`[TempVC] ❌ 30-min refresh for ${guildId}:`, err.message);
      }
    }
  }, 30 * 60 * 1000);

  // ── TICKET: Start inactivity monitor ────────────────────────────────
  const { startInactivityMonitor } = await import('../handlers/inactivityHandler.js');
  startInactivityMonitor(client);

  // ── NOTIFICATION: Started in index.js ────────────────────────────────

  // ── Graceful shutdown ───────────────────────────────────────────────
  async function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Shutting down…`);
    try {
      const { sendOfflineLog, sendErrorLog } = await import('../utils/botLogger.js');
      await sendOfflineLog(`Signal ${signal}`);
    } catch (e) {
      console.error('Failed to send offline log');
    }
    client.destroy();
    process.exit(0);
  }

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', async (err) => {
    console.error('[UnhandledRejection]', err);
    try {
      const { sendErrorLog } = await import('../utils/botLogger.js');
      await sendErrorLog('Unhandled promise rejection', err);
    } catch {}
  });
  process.on('uncaughtException', async (err) => {
    console.error('[UncaughtException]', err);
    try {
      const { sendErrorLog } = await import('../utils/botLogger.js');
      await sendErrorLog('Uncaught exception', err);
    } catch {}
  });

  console.log('📊 Stats: every minute | 📋 Status report: every 10 minutes | 🔄 TempVC: every 30 min');
}
