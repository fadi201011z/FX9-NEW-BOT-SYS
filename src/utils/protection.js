/**
 * protection.js - shared readers and actions for the dashboard-controlled
 * protection systems on the bot side.
 *
 * Every value lives in the shared `guild_config` collection under the same key
 * the dashboard writes, so the two halves never disagree about a name. The
 * cache in database.js is reloaded every 10s and right after the dashboard
 * pushes /api/sync-config, so a change here is effective almost immediately.
 */

import { getConfig } from '../database.js';

/** Raw config read with a fallback (empty string counts as "not set"). */
export function cfgOf(guildId, key, def) {
  const v = getConfig(guildId, key);
  return v === null || v === undefined || v === '' ? def : v;
}

/** Boolean flag; anything other than the literal "false" is on. */
export function flagOn(guildId, key) {
  return String(cfgOf(guildId, key, 'true')) !== 'false';
}

/** Integer read, clamped to [min, max] so a bad write can never break a limit. */
export function intCfg(guildId, key, def, min, max) {
  let n = parseInt(cfgOf(guildId, key, def), 10);
  if (!Number.isFinite(n)) n = def;
  if (Number.isFinite(min)) n = Math.max(min, n);
  if (Number.isFinite(max)) n = Math.min(max, n);
  return n;
}

/** JSON array read; never throws, always returns an array of strings. */
export function jsonList(guildId, key) {
  try {
    const parsed = JSON.parse(cfgOf(guildId, key, '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

/** The three exemption lists as one object. */
export function whitelist(guildId) {
  return {
    roles: jsonList(guildId, 'protection_whitelist_roles'),
    users: jsonList(guildId, 'protection_whitelist_users'),
    channels: jsonList(guildId, 'protection_whitelist_channels'),
  };
}

/** Is this member (or channel) exempt from the automatic systems? */
export function isExempt(guildId, member, channelId) {
  const wl = whitelist(guildId);
  if (channelId && wl.channels.includes(channelId)) return true;
  if (!member) return false;
  if (wl.users.includes(member.id)) return true;
  if (wl.roles.length && member.roles?.cache?.some((r) => wl.roles.includes(r.id))) return true;
  return false;
}

/** Human labels for what a moderation action actually did. */
export const PUNISH_LABEL = {
  timeout: 'Timed out',
  kick:    'Kicked',
  ban:     'Banned',
  warn:    'Warning only',
  strip:   'All roles removed',
  failed:  'Not applied (missing permission or higher role)',
  none:    'Message deleted',
};

/**
 * Applies a moderation action and reports what actually happened. The
 * discord.js bannable/kickable/moderatable getters already fold in role
 * hierarchy and the Administrator flag, so this can never strip an admin out
 * of their own server by accident.
 */
export async function applyMemberAction(member, action, reason, timeoutMs = 60_000) {
  if (!member) return 'failed';
  try {
    if (action === 'ban') {
      if (!member.bannable) return 'failed';
      await member.ban({ reason });
      return 'ban';
    }
    if (action === 'kick') {
      if (!member.kickable) return 'failed';
      await member.kick(reason);
      return 'kick';
    }
    if (action === 'timeout') {
      if (!member.moderatable) return 'failed';
      await member.timeout(timeoutMs, reason);
      return 'timeout';
    }
    if (action === 'strip') {
      if (member.permissions?.has?.('Administrator')) return 'failed';
      await member.roles.set([], reason);
      return 'strip';
    }
  } catch { return 'failed'; }
  return 'warn';
}

/** Resolved anti-nuke settings for a guild. */
export function nukeSettings(guildId) {
  return {
    enabled:      flagOn(guildId, 'anti_nuke'),
    channelLimit: intCfg(guildId, 'nuke_channel_limit', 3, 2, 25),
    roleLimit:    intCfg(guildId, 'nuke_role_limit', 3, 2, 25),
    banLimit:     intCfg(guildId, 'nuke_ban_limit', 5, 2, 50),
    windowMs:     intCfg(guildId, 'nuke_window', 10_000, 2_000, 300_000),
    action:       cfgOf(guildId, 'nuke_action', 'strip'),
  };
}

/** Resolved anti-raid settings for a guild. */
export function raidSettings(guildId) {
  return {
    enabled:     flagOn(guildId, 'anti_raid'),
    limit:       intCfg(guildId, 'raid_limit', 10, 3, 100),
    windowMs:    intCfg(guildId, 'raid_window', 10_000, 2_000, 120_000),
    action:      cfgOf(guildId, 'raid_action', 'alert'),
    minAgeDays:  intCfg(guildId, 'raid_min_account_age', 0, 0, 365),
  };
}
