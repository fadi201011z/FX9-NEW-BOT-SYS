/**
 * audit.js — reads the server audit log to answer "who did this?".
 *
 * Discord only exposes the audit log to moderators and bots, and the bot must
 * hold View Audit Log, so `getAuditEntry` returns null rather than throwing
 * when it is unavailable.
 *
 * Every moderation event fires an audit entry within a second or two of the
 * action. Entries are cached for 2.5 seconds, which is long enough to serve a
 * burst of simultaneous events (one ban in a mass-ban raid) from a single
 * request instead of one request per event.
 */

const entryCache = new Map();
const TTL_MS = 2500;

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').AuditLogEvent} type
 * @returns {Promise<import('discord.js').AuditLogEntry|null>}
 */
export async function getAuditEntry(guild, type) {
  const key = `${guild.id}:${type}`;
  const now = Date.now();

  const hit = entryCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.entry;

  let entry = null;
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 1 });
    entry = logs.entries.first() ?? null;
  } catch { /* no permission, or the audit log is unavailable */ }

  entryCache.set(key, { at: now, entry });
  return entry;
}