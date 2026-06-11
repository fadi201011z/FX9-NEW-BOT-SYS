import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';

export const name = Events.MessageDelete;
export const once = false;

export async function execute(message) {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const hasContent     = message.content && message.content.trim().length > 0;
  const hasAttachments = message.attachments?.size > 0;
  if (!hasContent && !hasAttachments) return;

  const logCh = await getLogChannel(message.guild, getConfig(message.guild.id, 'log_channel'));
  if (!logCh) return;

  let deletedBy = 'غير معروف (حذف ذاتي أو غير محفوظ)';
  try {
    const logs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 1 });
    const entry = logs.entries.first();
    if (entry && entry.target?.id === message.author?.id && Date.now() - entry.createdTimestamp < 5000) {
      deletedBy = `<@${entry.executor.id}> (${entry.executor.tag})`;
    }
  } catch { /* audit log غير متاح */ }

  const contentValue = hasContent
    ? message.content.slice(0, 1024)
    : '*[لا يوجد نص — مرفق فقط]*';

  const embed = new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle('🗑️  رسالة محذوفة')
    .addFields(
      { name: '👤  المرسل',     value: `${message.author} (${message.author?.tag ?? 'غير معروف'})`, inline: true },
      { name: '💬  القناة',     value: `${message.channel}`,                                         inline: true },
      { name: '🗑️  حُذفت بواسطة', value: deletedBy,                                                 inline: true },
      { name: '📝  المحتوى',    value: contentValue,                                                  inline: false },
    )
    .setThumbnail(message.author?.displayAvatarURL({ dynamic: true }) ?? null)
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
