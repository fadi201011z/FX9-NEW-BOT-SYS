import { Events, AuditLogEvent } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';

export const name = Events.MessageUpdate;
export const once = false;

export async function execute(oldMessage, newMessage) {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const logCh = await getLogChannel(newMessage.guild, getConfig(newMessage.guild.id, 'log_channel'));
  if (!logCh) return;

  let editedBy = null;
  try {
    const entry = await getAuditEntry(newMessage.guild, AuditLogEvent.MessageUpdate);
    if (entry && entry.target?.id === newMessage.author?.id && Date.now() - entry.createdTimestamp < 5000) {
      editedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  const fields = [
    field('Channel', newMessage.channel.toString()),
    field('Jump', `[Go to message](${newMessage.url})`),
    field('Before', (oldMessage.content || '*[empty]*').slice(0, 1024), false),
    field('After', (newMessage.content || '*[empty]*').slice(0, 1024), false),
  ];
  // A self-edit has no audit entry — only claim an editor when one exists.
  if (editedBy) fields.push(field('Edited by', editedBy));

  await logCh.send({
    embeds: [logEntry({
      kind: 'message_update',
      target: `${newMessage.author} (${userTag(newMessage.author)})`,
      fields,
      footer: 'Kratos System • Server log',
    })],
  }).catch(() => {});
}