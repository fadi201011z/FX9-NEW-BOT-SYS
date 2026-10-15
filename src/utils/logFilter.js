/**
 * logFilter.js — the one place that answers "may this channel change be written
 * to a log channel?".
 *
 * The live statistics voice channels (`👥 Members` / `🟢 Online` / `🤖 Bots`)
 * are renamed by the bot itself every minute through `statusUpdater.js`, and
 * Discord reports every rename back as a channel-update gateway event. Without
 * this gate the modlog received one "channel updated" card per minute, for as
 * long as the bot stayed up — the loudest source of noise in the logs.
 *
 * The check reads the guild's own configuration, so it keeps working even when
 * the audit log is unavailable (the bot lacking `View Audit Log`).
 */

import { getConfig } from '../database.js';

/** Config keys of the channels the bot creates and renames on a timer. */
const SELF_MAINTAINED_KEYS = Object.freeze(['stats_total', 'stats_online', 'stats_bots']);

/**
 * True when `channelId` is a channel whose name the bot rewrites by itself.
 * Such a channel must never produce a log entry for its own rename.
 *
 * @param {string} guildId
 * @param {string} channelId
 * @returns {boolean}
 */
export function isSelfMaintainedChannel(guildId, channelId) {
  if (!guildId || !channelId) return false;
  return SELF_MAINTAINED_KEYS.some((key) => getConfig(guildId, key) === channelId);
}
