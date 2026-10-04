import { Events, AuditLogEvent } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';

export const name = Events.RoleUpdate;
export const once = false;

const hex = (c) => `\`#${c.toString(16).padStart(6, '0')}\``;

export async function execute(oldRole, newRole) {
  const guild = newRole.guild;
  if (!guild) return;

  const nameChanged  = oldRole.name !== newRole.name;
  const colorChanged = oldRole.color !== newRole.color;
  const permsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
  if (!nameChanged && !colorChanged && !permsChanged) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let modifiedBy = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.RoleUpdate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      modifiedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  const fields = [];

  if (nameChanged) {
    fields.push(field('Name before', oldRole.name.slice(0, 1024)));
    fields.push(field('Name after', newRole.name.slice(0, 1024)));
  }

  if (colorChanged) {
    fields.push(field('Colour before', hex(oldRole.color)));
    fields.push(field('Colour after', hex(newRole.color)));
  }

  // Permission changes get a named field rather than a raw bitfield, which
  // would be unreadable and is the single most security-relevant edit here.
  if (permsChanged) {
    const added   = newRole.permissions.subtract(oldRole.permissions);
    const removed = oldRole.permissions.subtract(newRole.permissions);
    if (added.size)   fields.push(field('Permissions added', [...added.toArray()].join(', '), false));
    if (removed.size) fields.push(field('Permissions removed', [...removed.toArray()].join(', '), false));
  }

  await modLogCh.send({
    embeds: [logEntry({
      kind: 'role_update',
      target: `${newRole} \`${newRole.id}\``,
      actor: modifiedBy,
      fields,
    })],
  }).catch(() => {});
}