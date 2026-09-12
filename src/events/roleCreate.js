import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, userTag } from '../utils/embeds.js';

export const name = Events.RoleCreate;
export const once = false;

export async function execute(role) {
  const guild = role.guild;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let creator = 'غير معروف';
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.RoleCreate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      creator = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setColor(Colors.ROLE)
    .setTitle('🎭  إنشاء رتبة جديدة')
    .addFields(
      { name: '🏷️  الرتبة',  value: `${role} \`${role.name}\``, inline: true },
      { name: '🆔  المعرّف',  value: `\`${role.id}\``,           inline: true },
      { name: '🎨  اللون',    value: `\`#${role.color.toString(16).padStart(6, '0')}\``, inline: true },
      { name: '👤  المنشئ',   value: creator,                   inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });

  await modLogCh.send({ embeds: [embed] }).catch(() => {});
}