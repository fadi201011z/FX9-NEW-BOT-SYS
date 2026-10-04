/**
 * recentAction.js — remembers, for a few seconds, that the bot itself just
 * made a change Discord is about to report back as a gateway event.
 *
 * Without this a single moderation action is written to the modlog twice:
 *
 *   /role add   →  writes "Role granted"        to the modlog
 *   GUILD_MEMBER_UPDATE  →  writes "Member updated"  to the same modlog
 *
 * for the same member, seconds apart. The event handler is kept — it is the
 * only thing that records a role change made from the dashboard, the client, or
 * another bot — so the fix is for the *command* to declare what it just did and
 * for the *event* to stand down for exactly that member.
 *
 * Discord sends gateway events a moment after the REST call resolves, and the
 * two travel over different connections, so a delay is the only reliable way to
 * tell the echo apart from a genuine change. Four seconds is far longer than
 * the observed gap and short enough that a hand-made change a minute later
 * still logs normally.
 */

const DEFAULT_TTL_MS = 4_000;

const recent = new Map();

/** Record that the bot just performed `key`. */
export function markSelfAction(key, ttlMs = DEFAULT_TTL_MS) {
  recent.set(key, Date.now() + ttlMs);
}

/**
 * Whether the bot made this exact change moments ago.
 *
 * Non-destructive on purpose: `GUILD_MEMBER_UPDATE` can arrive more than once
 * for a single REST call, and consuming the marker on the first read would let
 * the second through.
 *
 * @param {string} key
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
export function isSelfAction(key, ttlMs = DEFAULT_TTL_MS) {
  const expiry = recent.get(key);
  if (expiry === undefined) return false;

  if (Date.now() > expiry) {
    recent.delete(key);
    return false;
  }
  return true;
}

/** Test seam. */
export function clearSelfActions() {
  recent.clear();
}

// ─── Keys ───────────────────────────────────────────────────────────────────
// Built here so a command and the event that echoes it cannot drift apart on
// spelling, which would silently defeat the whole mechanism.

/** A role grant or revoke made by /role on a specific member. */
export const roleChangeKey = (guildId, memberId) => `role:${guildId}:${memberId}`;

/** The automatic 24-hour unban armed by the restricted-channel guard. */
export const autoUnbanKey = (guildId, userId) => `unban:${guildId}:${userId}`;

// A ban that has to lift itself 24 hours later is minutes away from any other
// unban, so the echo of this one needs a far longer grace period than a
// role change does.
export const AUTO_UNBAN_TTL_MS = 30_000;