import { Events, EmbedBuilder } from 'discord.js';
import { Colors } from '../utils/embeds.js';
import { getGuildInvite } from '../utils/invite.js';

export const name = Events.GuildBanRemove;
export const once = false;

export async function execute(ban, client) {
  const { guild, user } = ban;
  if (!guild || user.bot) return;

  const key = `${guild.id}:${user.id}`;
  if (client.pendingAutoUnbans?.has(key)) return;

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
