import { Events, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
  const { guild } = member;

  const logCh = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));
  if (!logCh) return;

  const roles = member.roles.cache
    .filter(r => r.id !== guild.id)
    .map(r => r.toString())
    .join(', ') || 'لا توجد';

  const joinedAgo = member.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
    : 'غير معروف';

  const embed = new EmbedBuilder()
    .setColor(Colors.LEAVE)
    .setTitle('📤  مغادرة عضو')
    .addFields(
      { name: '👤  العضو',        value: `${member.user.tag}`,        inline: true },
      { name: '🆔  المعرّف',      value: `\`${member.user.id}\``,     inline: true },
      { name: '📅  انضم منذ',     value: joinedAgo,                    inline: true },
      { name: '🏷️  الأدوار',      value: roles.slice(0, 1024),        inline: false },
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' });

  await logCh.send({ embeds: [embed] }).catch(() => {});
  await updateStatusChannels(guild).catch(() => {});
}
