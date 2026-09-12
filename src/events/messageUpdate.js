import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, userTag } from '../utils/embeds.js';

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
      editedBy = `<@${entry.executor.id}>`;
    }
  } catch { /* audit log غير متاح */ }

  const embed = new EmbedBuilder()
    .setColor(Colors.EDIT)
    .setTitle('✏️  رسالة مُعدَّلة')
    .addFields(
      { name: '👤  المرسل',       value: `${newMessage.author} (${userTag(newMessage.author)})`, inline: true },
      { name: '💬  القناة',        value: `${newMessage.channel}`,                            inline: true },
      { name: '🔗  الرابط المباشر', value: `[انتقل للرسالة](${newMessage.url})`,              inline: true },
      ...(editedBy ? [{ name: '🛡️  عُدِّل بواسطة', value: editedBy, inline: true }] : []),
      { name: '📝  قبل التعديل',    value: (oldMessage.content || '*[فارغ]*').slice(0, 1024), inline: false },
      { name: '📝  بعد التعديل',    value: (newMessage.content || '*[فارغ]*').slice(0, 1024), inline: false },
    )
    .setThumbnail(newMessage.author?.displayAvatarURL({ dynamic: true }) ?? null)
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' });

  await logCh.send({ embeds: [embed] }).catch(() => {});
}
