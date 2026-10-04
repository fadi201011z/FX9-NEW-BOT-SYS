/**
 * Guardian & SYS BOT — role and permission configuration.
 *
 * `ROLES` holds the five staff tiers used across the server. `COMMAND_ROLES`
 * maps a command to the roles allowed to run it, grouped by capability tier.
 */

// ─── Staff tiers ───────────────────────────────────────────────────────────

export const ROLES = {
  DEVELOPER:  ['1499391819899998269'],
  ADMIN:      ['1499391995867697282'],
  SENIOR_MOD: ['1500142521651826889'],
  MODERATOR:  ['1499392077858078720'],
  SUPPORT:    ['1500142106990219335'],
  TRIAL:      ['1499392183193833493'],
};

// ─── Per-command role gates ────────────────────────────────────────────────

export const COMMAND_ROLES = {
  // Tier 1 — system commands
  eval:       [...ROLES.DEVELOPER],
  database:   [...ROLES.DEVELOPER],
  reload:     [...ROLES.DEVELOPER],

  // Tier 2 — senior administration
  setup:      [...ROLES.DEVELOPER, ...ROLES.ADMIN],
  settings:   [...ROLES.DEVELOPER, ...ROLES.ADMIN],
  logs:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],

  // Tier 3 — server control
  manage_roles:    [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],
  manage_channels: [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],
  unban:           [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],

  // Tier 4 — moderation
  ban:        [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  kick:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  timeout:    [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  warn:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  lock:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  unlock:     [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  hide:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  unhide:     [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  nick:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],

  // Tier 5 — support and maintenance
  clear:      [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR, ...ROLES.SUPPORT, ...ROLES.TRIAL],
  slowmode:   [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR, ...ROLES.SUPPORT, ...ROLES.TRIAL],
  ticket:     [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR, ...ROLES.SUPPORT],
};

// ─── Channel-lock permission logic ─────────────────────────────────────────

/** Roles that always keep write access, even while the channel is locked. */
const ALLOWED_ADMINS = [
  ...ROLES.DEVELOPER,
  ...ROLES.ADMIN,
  ...ROLES.SENIOR_MOD,
  ...ROLES.MODERATOR,
];

/** Roles explicitly denied write access while the channel is locked. */
const RESTRICTED_STAFF = [
  ...ROLES.SUPPORT,
  ...ROLES.TRIAL,
];

/**
 * Apply the permission model to a channel being locked.
 *
 * Senior staff and moderators keep write access; support and trial roles are
 * explicitly denied so the lock actually means something.
 */
export async function grantAdminAccess(channel, guild) {
  for (const roleId of ALLOWED_ADMINS) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await channel.permissionOverwrites.edit(role, {
        SendMessages: true,
        ViewChannel: true,
      }).catch(() => {});
    }
  }

  for (const roleId of RESTRICTED_STAFF) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await channel.permissionOverwrites.edit(role, {
        SendMessages: false,
      }).catch(() => {});
    }
  }
}

/** Remove every staff overwrite and return the channel to its normal state. */
export async function clearAdminOverwrites(channel, guild) {
  for (const roleId of [...ALLOWED_ADMINS, ...RESTRICTED_STAFF]) {
    const overwrite = channel.permissionOverwrites.cache.get(roleId);
    if (overwrite) {
      await overwrite.delete().catch(() => {});
    }
  }
}