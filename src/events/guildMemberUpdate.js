import { Events, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:10001';

export const name = Events.GuildMemberUpdate;
export const once = false;

export async function execute(oldMember, newMember) {
  const { guild } = newMember;

  // ─── إخطار الداشبورد بتغيير الرتب (مزامنة المدراء التلقائية) ─────────────
  const oldRoleIds = oldMember.roles.cache.map(r => r.id);
  const newRoleIds = newMember.roles.cache.map(r => r.id);
  const rolesChanged = oldRoleIds.length !== newRoleIds.length ||
    oldRoleIds.some(id => !newRoleIds.includes(id));
  if (rolesChanged) {
    try {
      await fetch(`${DASHBOARD_URL}/admins/webhook/sync-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: guild.id, userId: newMember.id }),
      });
    } catch {}
  }

  // تغيير الأدوار → يُسجَّل في قناة سجلات الإشراف
  const modLogCh  = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  // تغيير اللقب  → يُسجَّل في قناة السجلات العامة
  const logCh     = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  // ─── تغيير الأدوار ────────────────────────────────────────────────────────
  const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== guild.id);
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== guild.id);

  if ((addedRoles.size > 0 || removedRoles.size > 0) && modLogCh) {
    const embed = new EmbedBuilder()
      .setColor(Colors.ROLE)
      .setTitle('🏷️  تغيير الأدوار')
      .addFields(
        { name: '👤  العضو',  value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: '🆔  المعرّف', value: `\`${newMember.user.id}\``,             inline: true },
      )
      .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });

    if (addedRoles.size) {
      embed.addFields({
        name: '✅  أدوار مُضافة',
        value: addedRoles.map(r => r.toString()).join(', ').slice(0, 1024),
        inline: false,
      });
    }
    if (removedRoles.size) {
      embed.addFields({
        name: '❌  أدوار محذوفة',
        value: removedRoles.map(r => r.toString()).join(', ').slice(0, 1024),
        inline: false,
      });
    }

    await modLogCh.send({ embeds: [embed] }).catch(() => {});
  }

  // ─── تغيير اللقب ──────────────────────────────────────────────────────────
  if (oldMember.nickname !== newMember.nickname && logCh) {
    const embed = new EmbedBuilder()
      .setColor(Colors.EDIT)
      .setTitle('✏️  تغيير اللقب')
      .addFields(
        { name: '👤  العضو',   value: `${newMember} (${newMember.user.tag})`, inline: false },
        { name: '📝  قبل',     value: oldMember.nickname ?? oldMember.user.username, inline: true },
        { name: '📝  بعد',     value: newMember.nickname ?? newMember.user.username, inline: true },
      )
      .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' });

    await logCh.send({ embeds: [embed] }).catch(() => {});
  }
}
