import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, userTag } from '../utils/embeds.js';

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
  let deletedBy = 'غير معروف (حذف ذاتي أو غير محفوظ)';
  try {
    const entry = await getAuditEntry(message.guild, AuditLogEvent.MessageDelete);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      const targetMatches = author ? entry.target?.id === author.id : true;
      if (targetMatches) {
        deletedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
        if (!author && entry.target) author = entry.target;
      }
    }
  } catch { /* audit log غير متاح */ }

  if (!author && !hasContent && !hasAttachments) return;

  const contentValue = hasContent
    ? message.content.slice(0, 1024)
    : '*[لا يوجد نص — مرفق فقط]*';

  const embed = new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle('🗑️  رسالة محذوفة')
    .addFields(
      { name: '👤  المرسل',     value: `${author} (${userTag(author)})`, inline: true },
      { name: '💬  القناة',     value: `${message.channel}`,             inline: true },
      { name: '🗑️  حُذفت بواسطة', value: deletedBy,                     inline: true },
      { name: '📝  المحتوى',    value: contentValue,                     inline: false },
    )
    .setThumbnail(author?.displayAvatarURL({ dynamic: true }) ?? null)
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' });

  if (hasAttachments) {
    embed.addFields({
      name: '📎  المرفقات',
      value: message.attachments.map(a => a.proxyURL).join('\n').slice(0, 1024),
      inline: false,
    });
  }

  await logCh.send({ embeds: [embed] }).catch(() => {});
}
