import { PermissionFlagsBits } from 'discord.js';
import { fail } from './embeds.js';
import { getConfig } from '../database.js';

/**
 * Plain Discord permission check. Still used internally in a few places.
 */
export async function requirePermission(interaction, permission) {
  if (!interaction.member.permissions.has(permission)) {
    await interaction.reply(fail('You do not have permission to use this command.'));
    return false;
  }
  return true;
}

/**
 * Role-based check against the allow-list in config/roles.js.
 *
 * Allowed automatically:
 *   - the server owner
 *   - anyone holding Discord's Administrator permission
 * Everyone else needs a role from the list.
 *
 * @param {Interaction} interaction
 * @param {string[]}    allowedRoles  role IDs permitted to run the command
 */
export async function requireRole(interaction, allowedRoles) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Drop placeholders and empty entries, so an unconfigured list is detected
  // rather than silently treated as "allow nobody".
  const validRoles = allowedRoles.filter((id) => id && id !== 'ROLE_ID_HERE');

  if (validRoles.length === 0) {
    // The allow-list lives in the bot's own source, which a server admin
    // cannot edit — so telling them to go edit it was never actionable. Point
    // them at what the bot developer has to do instead.
    await interaction.reply(fail(
      'No moderation roles are configured for this command yet. '
      + 'The bot developer needs to add role IDs to config/roles.js.'
    ));
    return false;
  }

  const memberRoles = interaction.member.roles.cache;
  const hasRole = validRoles.some((roleId) => memberRoles.has(roleId));

  if (!hasRole) {
    await interaction.reply(fail('You do not have a role that is allowed to use this command.'));
    return false;
  }

  return true;
}

/**
 * Whether a moderation action is possible against this member, by role
 * hierarchy. Takes a guild rather than an interaction, so it stays reusable
 * from both a slash command and an HTTP endpoint.
 */
export function canModerate(guild, target) {
  const botMember = guild.members.me;
  if (!botMember) return false;
  if (target.id === guild.ownerId) return false;
  if (target.roles.highest.position >= botMember.roles.highest.position) return false;
  return true;
}

// ─── Channel lookup ────────────────────────────────────────────────────────

const channelCache = new Map();
const CHANNEL_CACHE_TTL_MS = 15_000;

/** Fetch a log channel by ID, or null. Short-lived cache avoids refetching. */
export async function getLogChannel(guild, channelId) {
  if (!channelId) return null;

  const key = `${guild.id}:${channelId}`;
  const cached = channelCache.get(key);
  if (cached?.ch && Date.now() - cached.at < CHANNEL_CACHE_TTL_MS) return cached.ch;

  try {
    const ch = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId);
    if (ch) channelCache.set(key, { ch, at: Date.now() });
    return ch;
  } catch { return null; }
}

/** All three configured log channels in one pass. */
export async function getChannels(guild) {
  const [logCh, modLogCh, botLogCh] = await Promise.all([
    getLogChannel(guild, getConfig(guild.id, 'log_channel')),
    getLogChannel(guild, getConfig(guild.id, 'modlog_channel')),
    getLogChannel(guild, getConfig(guild.id, 'botlog_channel')),
  ]);
  return { logCh, modLogCh, botLogCh };
}