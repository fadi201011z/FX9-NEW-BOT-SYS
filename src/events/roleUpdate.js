import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, userTag } from '../utils/embeds.js';

export const name = Events.RoleUpdate;
export const once = false;

const hex = c => `\`#${c.toString(16).padStart(6, '0')}\``;

export async function execute(oldRole, newRole) {
  const guild = newRole.guild;
  if (!guild) return;

  const nameChanged  = oldRole.name !== newRole.name;
  const colorChanged = oldRole.color !== newRole.color;
  const permsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
  if (!nameChanged && !colorChanged && !permsChanged) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let modifiedBy = 'غير معروف';
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.RoleUpdate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      modifiedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setColor(Colors.ROLE)
    .setTitle('✏️  تعديل رتبة')
    .addFields(
      { name: '🏷️  الرتبة',  value: `${newRole} \`${newRole.id}\``, inline: true },
      ...(nameChanged ? [
        { name: '📝  الاسم قبل', value: oldRole.name.slice(0, 1024), inline: true },
        { name: '📝  الاسم بعد', value: newRole.name.slice(0, 1024), inline: true },
      ] : []),
      ...(colorChanged ? [
        { name: '🎨  اللون قبل', value: hex(oldRole.color), inline: true },
        { name: '🎨  اللون بعد', value: hex(newRole.color), inline: true },
      ] : []),
      ...(permsChanged ? [{ name: '🔒  الصلاحيات', value: 'تم تغيير صلاحيات الرتبة', inline: false }] : []),
      { name: '🛡️  بواسطة', value: modifiedBy, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });

  await modLogCh.send({ embeds: [embed] }).catch(() => {});
}