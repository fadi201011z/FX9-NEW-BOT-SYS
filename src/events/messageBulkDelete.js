import { Events, AuditLogEvent } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';

export const name = Events.MessageBulkDelete;
export const once = false;

export async function execute(messages, channel) {
  const guild = channel.guild;
  if (!guild) return;

  const logCh = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));
  if (!logCh) return;

  let deletedBy = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.MessageBulkDelete);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      deletedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  const count = messages.size;

  // A sample of what was removed, so the log is useful without being a
  // transcript. Three messages is enough to identify the pattern.
  const sample = [...messages.values()]
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(0, 3)
    .map((m) => m.content.slice(0, 200))
    .join('\n')
    .slice(0, 950);

  const fields = [
    field('Channel', channel.toString()),
    field('Messages', `${count}`),
    field('Deleted by', deletedBy ?? '*no audit entry available*', false),
  ];
  if (sample) fields.push(field('Content sample', `\`\`\`\n${sample}\n\`\`\``, false));

  await logCh.send({
    embeds: [logEntry({
      kind: 'message_bulk_delete',
      target: `${channel} — ${count} message${count === 1 ? '' : 's'}`,
      actor: deletedBy,
      fields,
      footer: 'Kratos System • Server log',
    })],
  }).catch(() => {});
}