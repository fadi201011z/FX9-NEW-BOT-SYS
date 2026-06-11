import { Events, ActivityType } from 'discord.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import { startPresenceRotation } from '../utils/presence.js';
import { sendOnlineLog, startHeartbeat } from '../utils/botLogger.js';

export const name = Events.ClientReady;
export const once = true;

const STATS_INTERVAL = 60 * 1000;

export async function execute(client) {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║     FX9 Merged Bot — Ready!           ║`);
  console.log(`╠════════════════════════════════════════╣`);
  console.log(`║  Tag:    ${client.user.tag.padEnd(30)}║`);
  console.log(`║  Guilds: ${String(client.guilds.cache.size).padEnd(30)}║`);
  console.log(`║  Commands: ${String(client.commands?.size ?? 0).padEnd(27)}║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  // ── SYS: Rotating presence ──────────────────────────────────────────
  startPresenceRotation(client);

  // ── SYS: Update status channels immediately ─────────────────────────
  for (const [, guild] of client.guilds.cache) {
    try { await updateStatusChannels(guild); } catch { /* not configured yet */ }
  }

  // ── SYS: Status channel refresh every 60s ───────────────────────────
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try { await updateStatusChannels(guild); } catch {}
    }
  }, STATS_INTERVAL);

  // ── SYS: Online log + heartbeat ─────────────────────────────────────
  await sendOnlineLog();
  startHeartbeat();

  // ── VOICE: Load temp voice data, clean stale channels ───────────────
  const { loadFromDisk, cleanStaleChannels, getAllSetups, refreshPanel, getActiveCount, updatePanelMessageId, buildStatusPanel } = await import('../handlers/tempVoice.js');
  loadFromDisk();
  await cleanStaleChannels(client);

  // ── VOICE: Restore permanent panels ─────────────────────────────────
  for (const [guildId, setup] of getAllSetups()) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      const textCh = guild.channels.cache.get(setup.textChannelId);
      if (!textCh) continue;

      const count = getActiveCount(guildId);
      const panel = buildStatusPanel(setup, count);

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

  // ── VOICE: Music now-playing updater every 12s ──────────────────────
  const { updateNowPlayingEmbed } = await import('../handlers/music.js');
  setInterval(async () => {
    for (const [guildId] of client.musicQueues) {
      await updateNowPlayingEmbed(client, guildId);
    }
  }, 12_000);

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
        const panel = buildStatusPanel(setup, count);

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

  // ── Graceful shutdown ───────────────────────────────────────────────
  async function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Shutting down…`);
    try {
      const { sendOfflineLog, sendErrorLog } = await import('../utils/botLogger.js');
      await sendOfflineLog(`إشارة ${signal}`);
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
      await sendErrorLog('Promise مرفوضة', err);
    } catch {}
  });
  process.on('uncaughtException', async (err) => {
    console.error('[UncaughtException]', err);
    try {
      const { sendErrorLog } = await import('../utils/botLogger.js');
      await sendErrorLog('استثناء غير محلول', err);
    } catch {}
  });

  console.log('📊 الإحصائيات: كل دقيقة | 📋 تقرير الحالة: كل 10 دقائق | 🎵 Music: كل 12ث | 🔄 TempVC: كل 30د');
}
