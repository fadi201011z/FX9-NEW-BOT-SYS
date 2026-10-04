import { getConfig } from '../database.js';

/**
 * Keeps the statistics voice channels in sync.
 *
 * `guild.members.fetch()` is a full network round trip, so it only runs when a
 * caller explicitly asks (the once-a-minute timer). Event-driven callers — a
 * join, a leave, a voice change — read the local cache instead, which is fast
 * enough to stay off the critical path.
 *
 * `inflight` stops two triggers from overlapping on the same guild.
 */

const inflight = new Set();

export async function updateStatusChannels(guild, { fetchMembers = true } = {}) {
  const totalId  = getConfig(guild.id, 'stats_total');
  const onlineId = getConfig(guild.id, 'stats_online');
  const botsId   = getConfig(guild.id, 'stats_bots');

  if (!totalId && !onlineId && !botsId) return;
  if (inflight.has(guild.id)) return;

  inflight.add(guild.id);

  try {
    if (fetchMembers) await guild.members.fetch().catch(() => {});

    const members = guild.members.cache;
    const bots    = members.filter((m) => m.user.bot).size;
    // Bots are counted separately, so the "Members" channel shows people only.
    const humans = members.size - bots;

    let online = 0;
    try {
      online = members.filter(
        (m) => !m.user.bot && m.presence && m.presence.status !== 'offline',
      ).size;
    } catch { /* the presence intent is not enabled */ }

    const updates = [
      [totalId,  `👥 Members: ${humans}`],
      [onlineId, `🟢 Online: ${online}`],
      [botsId,   `🤖 Bots: ${bots}`],
    ];

    for (const [channelId, newName] of updates) {
      if (!channelId) continue;
      try {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        // The name check avoids a pointless API call every minute.
        if (channel && channel.name !== newName) {
          await channel.setName(newName).catch(() => {});
        }
      } catch { /* channel deleted or not writable */ }
    }
  } finally {
    inflight.delete(guild.id);
  }
}