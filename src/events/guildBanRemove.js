import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors, userTag } from '../utils/embeds.js';
import { getGuildInvite } from '../utils/invite.js';

export const name = Events.GuildBanRemove;
export const once = false;

export async function execute(ban, client) {
  const { guild, user } = ban;
  if (!guild || user.bot) return;

  const key = `${guild.id}:${user.id}`;
  if (client.pendingAutoUnbans?.has(key)) return;

  // ─── سجل فك الحظر في قناة الإشراف ──────────────────────────────────────
  let executor = 'غير معروف';
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
    const entry = logs.entries.first();
    if (entry && entry.target?.id === user.id && Date.now() - entry.createdTimestamp < 5000) {
      executor = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch {}

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.SUCCESS)
          .setTitle('✅  تم فك الحظر')
          .addFields(
            { name: '👤  العضو',    value: `${user} \`${user.id}\``, inline: true },
            { name: '🛡️  بواسطة',  value: executor,                  inline: true },
          )
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
      ],
    }).catch(() => {});
  }

  // ─── إرسال DM للعضو ────────────────────────────────────────────────────
  const inviteLink = await getGuildInvite(guild);
  try {
    const embed = new EmbedBuilder()
      .setColor(Colors.SUCCESS)
      .setTitle('✅ تم فك الحظر بواسطة الإدارة')
      .setDescription([
        `**السيرفر:** ${guild.name}`,
        'تم إلغاء الحظر يدوياً من قبل أحد المشرفين.',
        '',
        inviteLink
          ? `يمكنك العودة إلى السيرفر عبر الرابط:\n${inviteLink}`
          : 'يمكنك العودة إلى السيرفر الآن.',
      ].join('\n'))
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  الحماية التلقائية' });
    await user.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}
