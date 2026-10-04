import { Events, AuditLogEvent } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';

export const name = Events.MessageDelete;
export const once = false;

export async function execute(message) {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const hasContent     = message.content && message.content.trim().length > 0;
  const hasAttachments = message.attachments?.size > 0;

  const logCh = await getLogChannel(message.guild, getConfig(message.guild.id, 'log_channel'));
  if (!logCh) return;

  let author    = message.author ?? null;
  let deletedBy = null;
  try {
    const entry = await getAuditEntry(message.guild, AuditLogEvent.MessageDelete);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      const targetMatches = author ? entry.target?.id === author.id : true;
      if (targetMatches) {
        deletedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
        if (!author && entry.target) author = entry.target;
      }
    }
  } catch { /* audit log unavailable */ }

  if (!author && !hasContent && !hasAttachments) return;

  const fields = [
    field('Channel', message.channel.toString()),
    // No audit entry means the author deleted their own message, or the entry
    // has rolled out of Discord's 30-day window. Say that instead of guessing.
    field('Deleted by', deletedBy ?? '*self-deletion, or no audit entry available*', false),
    field('Content', hasContent
      ? message.content.slice(0, 1024)
      : '*[no text — attachment only]*', false),
  ];

  if (hasAttachments) {
    fields.push(field('Attachments', message.attachments.map((a) => a.proxyURL).join('\n').slice(0, 1024), false));
  }

  await logCh.send({
    embeds: [logEntry({
      kind: 'message_delete',
      target: author ? `${author} (${userTag(author)})` : '*unknown author*',
      fields,
      footer: 'Kratos System • Server log',
    })],
  }).catch(() => {});
}