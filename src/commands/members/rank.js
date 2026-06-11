import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('عرض ترتيبك في السيرفر حسب تاريخ الانضمام')
  .addUserOption(opt =>
    opt.setName('user').setDescription('العضو المراد فحصه (الافتراضي: أنت)')
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const member = interaction.options.getMember('user') ?? interaction.member;
  const user   = member.user;

  await interaction.guild.members.fetch().catch(() => {});

  const sorted = interaction.guild.members.cache
    .filter(m => !m.user.bot && m.joinedTimestamp)
    .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

  // استخدام Array من المفاتيح بدلاً من keyArray() المحذوفة في v14
  const sortedKeys = [...sorted.keys()];
  const rank       = sortedKeys.indexOf(member.id) + 1;
  const total      = sorted.size;

  if (rank === 0) {
    await interaction.editReply({ content: 'لم يُعثر على العضو في قائمة الانضمام.' });
    return;
  }

  const percentage = ((rank / total) * 100).toFixed(1);
  const sortedArr  = [...sorted.values()];
  const idx        = rank - 1;
  const before     = sortedArr[idx - 1] ?? null;
  const after      = sortedArr[idx + 1] ?? null;

  const badge =
    rank === 1                            ? '👑 أول عضو في السيرفر!'        :
    rank <= 10                            ? '🏆 من أوائل 10 أعضاء'          :
    rank <= Math.ceil(total * 0.1)        ? '⭐ ضمن أقدم 10% من الأعضاء'   :
                                            '👤 عضو';

  const joinedAgo = member.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
    : 'غير معروف';

  const embed = new EmbedBuilder()
    .setColor(rank <= 10 ? Colors.WARNING : Colors.DARK)
    .setTitle('📊  ترتيب الانضمام')
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription(badge)
    .addFields(
      { name: '👤 العضو',           value: `${member}`,                                            inline: true },
      { name: '🏅 الترتيب',         value: `#${rank} من ${total}`,                                 inline: true },
      { name: '📊 النسبة',          value: `أقدم من ${(100 - parseFloat(percentage)).toFixed(1)}% من الأعضاء`, inline: true },
      { name: '📅 تاريخ الانضمام',  value: joinedAgo,                                              inline: true },
      ...(before ? [{ name: '⬆️ انضم قبله',  value: `${before}`, inline: true }] : []),
      ...(after  ? [{ name: '⬇️ انضم بعده',  value: `${after}`,  inline: true }] : []),
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  ترتيب الانضمام' });

  await interaction.editReply({ embeds: [embed] });
}
