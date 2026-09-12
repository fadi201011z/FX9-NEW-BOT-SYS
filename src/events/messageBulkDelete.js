import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, userTag } from '../utils/embeds.js';

export const name = Events.MessageBulkDelete;
export const once = false;

export async function execute(messages, channel) {
  const guild = channel.guild;
  if (!guild) return;

  const logCh = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));
  if (!logCh) return;

  let deletedBy = 'غير معروف';
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.MessageBulkDelete);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      deletedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log غير متاح */ }

  const sample = [...messages.values()]
    .filter(m => m.content && m.content.trim().length > 0)
    .slice(0, 3)
    .map(m => m.content.slice(0, 200))
    .join('\n───\n');

  const embed = new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle('🧹  حذف جماعي للرسائل')
    .addFields(
      { name: '💬  القناة',    value: `${channel}`,                     inline: true },
      { name: '🗑️  العدد',     value: `\`${messages.size}\` رسالة`,     inline: true },
      { name: '🛡️  بواسطة',    value: deletedBy,                        inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' });

  if (sample) {
    embed.addFields({ name: '📝  عينة من المحتوى', value: `\`\`\`\n${sample.slice(0, 950)}\n\`\`\``, inline: false });
  }

  await logCh.send({ embeds: [embed] }).catch(() => {});
}