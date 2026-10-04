import { Events } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { logEntry, field } from '../utils/embeds.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:10001';
const API_SECRET = process.env.API_SECRET || '';

export const name = Events.GuildMemberUpdate;
export const once = false;

export async function execute(oldMember, newMember) {
  const { guild } = newMember;

  // ─── Notify the dashboard of a role change (keeps auto-admin in sync) ─────
  const oldRoleIds = oldMember.roles.cache.map((r) => r.id);
  const newRoleIds = newMember.roles.cache.map((r) => r.id);
  const rolesChanged = oldRoleIds.length !== newRoleIds.length
    || oldRoleIds.some((id) => !newRoleIds.includes(id));

  if (rolesChanged) {
    try {
      await fetch(`${DASHBOARD_URL}/admins/webhook/sync-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET,
        },
        body: JSON.stringify({ guildId: guild.id, userId: newMember.id }),
      });
    } catch { /* dashboard unreachable — logging still proceeds */ }
  }

  // Role changes → modlog.  Nickname changes → general log.
  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  const logCh    = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  // ─── Role change ─────────────────────────────────────────────────────────
  const addedRoles   = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id) && r.id !== guild.id);
  const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id) && r.id !== guild.id);

  if ((addedRoles.size > 0 || removedRoles.size > 0) && modLogCh) {
    const fields = [];
    if (addedRoles.size) {
      fields.push(field('Roles added', addedRoles.map((r) => r.toString()).join(', ').slice(0, 1024), false));
    }
    if (removedRoles.size) {
      fields.push(field('Roles removed', removedRoles.map((r) => r.toString()).join(', ').slice(0, 1024), false));
    }

    await modLogCh.send({
      embeds: [logEntry({
        kind: 'member_update',
        target: `${newMember} (\`${newMember.user.id}\`)`,
        fields,
        footer: 'Kratos System • Modlog',
      })],
    }).catch(() => {});
  }

  // ─── Nickname change ─────────────────────────────────────────────────────
  if (oldMember.nickname !== newMember.nickname && logCh) {
    await logCh.send({
      embeds: [logEntry({
        kind: 'member_update',
        target: `${newMember} (\`${newMember.user.id}\`)`,
        fields: [
          field('Nickname before', oldMember.nickname ?? oldMember.user.username),
          field('Nickname after', newMember.nickname ?? newMember.user.username),
        ],
        footer: 'Kratos System • Server log',
      })],
    }).catch(() => {});
  }
}