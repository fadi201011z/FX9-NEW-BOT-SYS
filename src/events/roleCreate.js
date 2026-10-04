import { Events, AuditLogEvent } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';

export const name = Events.RoleCreate;
export const once = false;

export async function execute(role) {
  const guild = role.guild;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let creator = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.RoleCreate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      creator = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  await modLogCh.send({
    embeds: [logEntry({
      kind: 'role_create',
      target: `${role} \`${role.name}\``,
      actor: creator,
      fields: [
        field('Role ID', `\`${role.id}\``),
        field('Colour', `\`#${role.color.toString(16).padStart(6, '0')}\``),
      ],
    })],
  }).catch(() => {});
}