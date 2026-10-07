import GuildStats from '../models/GuildStats.js';

/**
 * Daily per-guild analytics for the dashboard's "حالة سرفرك" page.
 *
 * Every write lands on a single document per guild per UTC day. Nothing in
 * here may throw back into the event that called it — a Mongo hiccup is not a
 * reason to skip somebody's welcome card or to drop a leave log — so every
 * path ends in a caught, logged error and a resolved promise.
 */

const DAY_MS = 86_400_000;

export const MAX_STATS_DAYS = 120;

export function utcDayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function upsert(guildId, update) {
  try {
    await GuildStats.updateOne({ guildId, date: utcDayKey() }, update, { upsert: true });
  } catch (err) {
    console.error('[GuildStats] write failed:', err.message);
  }
}

export function recordJoin(guildId, memberCount) {
  return upsert(guildId, { $inc: { joins: 1 }, $set: { memberCount } });
}

export function recordLeave(guildId, memberCount) {
  return upsert(guildId, { $inc: { leaves: 1 }, $set: { memberCount } });
}

/**
 * One presence sample for the day's `onlinePeak`. Humans only, matching what
 * the stats voice channel paints in the server — a status page that disagrees
 * with the number members can see is worse than one with a gap in it.
 */
export function samplePresence(guild) {
  try {
    let humans = 0;
    let bots = 0;
    let online = 0;
    for (const m of guild.members.cache.values()) {
      if (m.user.bot) {
        bots++;
        continue;
      }
      humans++;
      const status = m.presence && m.presence.status;
      if (status && status !== 'offline') online++;
    }
    return upsert(guild.id, {
      $max: { onlinePeak: online },
      $set: { memberCount: guild.memberCount, humans, bots },
    });
  } catch (err) {
    console.error('[GuildStats] sample failed:', err.message);
    return Promise.resolve();
  }
}

/**
 * The `days` window as a complete list of day keys, oldest first, including
 * days nothing happened. The caller zero-fills from this, so a guild that was
 * added yesterday still draws a full-width chart instead of a one-bar stub.
 */
export function dayKeys(days, now = Date.now()) {
  const span = Math.min(Math.max(Number(days) || 0, 1), MAX_STATS_DAYS);
  const keys = [];
  for (let i = span - 1; i >= 0; i--) keys.push(utcDayKey(now - i * DAY_MS));
  return keys;
}
