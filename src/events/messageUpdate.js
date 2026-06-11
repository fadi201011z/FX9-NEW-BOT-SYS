import { Events, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';

export const name = Events.MessageUpdate;
export const once = false;

export async function execute(oldMessage, newMessage) {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const logCh = await getLogChannel(newMessage.guild, getConfig(newMessage.guild.id, 'log_channel'));
  if (!logCh) return;

  const embed = new EmbedBuilder()
    .setColor(Colors.EDIT)
    .setTitle('✏️  رسالة مُعدَّلة')
    .addFields(
      { name: '👤  المرسل',       value: `${newMessage.author} (${newMessage.author?.tag})`, inline: true },
      { name: '💬  القناة',        value: `${newMessage.channel}`,                            inline: true },
      { name: '🔗  الرابط المباشر', value: `[انتقل للرسالة](${newMessage.url})`,              inline: true },
      { name: '📝  قبل التعديل',    value: (oldMessage.content || '*[فارغ]*').slice(0, 1024), inline: false },
      { name: '📝  بعد التعديل',    value: (newMessage.content || '*[فارغ]*').slice(0, 1024), inline: false },
    )
    .setThumbnail(newMessage.author?.displayAvatarURL({ dynamic: true }) ?? null)
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' });

  await logCh.send({ embeds: [embed] }).catch(() => {});
}
