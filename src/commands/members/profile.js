import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { getWarnings } from '../../database.js';
import { formatDuration } from '../../utils/parseDuration.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('عرض ملف عضو بشكل احترافي')
  .addUserOption(opt =>
    opt.setName('user').setDescription('العضو المراد عرض ملفه (الافتراضي: أنت)')
  );

export async function execute(interaction) {
  const member = interaction.options.getMember('user') ?? interaction.member;
  const user   = member.user;

  const warnings     = getWarnings(interaction.guildId, user.id);
  const accountAge   = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  const serverAge    = member.joinedTimestamp
    ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000)
    : null;

  const roles = member.roles.cache
    .filter(r => r.id !== interaction.guildId)
    .sort((a, b) => b.position - a.position)
    .map(r => r.toString())
    .slice(0, 5);

  const warnColor =
    warnings.length >= 3 ? Colors.BLOOD :
    warnings.length >= 1 ? Colors.WARNING :
                           Colors.WHITE;

  // تحديد شارة الوضع
  const statusMap = { online: '🟢 متصل', idle: '🌙 غائب', dnd: '🔴 مشغول', offline: '⚫ غير متصل' };
  const status    = statusMap[member.presence?.status ?? 'offline'];

  const embed = new EmbedBuilder()
    .setColor(warnColor)
    .setTitle(`👤  ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      // ── الهوية ───────────────────────────────────────────────────────────
      { name: '🆔 المعرّف',        value: `\`${user.id}\``,                                          inline: true },
      { name: '🎨 اللون',          value: member.displayHexColor,                                     inline: true },
      { name: '🤖 بوت',            value: user.bot ? 'نعم' : 'لا',                                   inline: true },
      // ── التواريخ ─────────────────────────────────────────────────────────
      { name: '📅 إنشاء الحساب',   value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>\n(${accountAge} يوم)`, inline: true },
      { name: '📥 انضمام السيرفر', value: member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>\n(${serverAge} يوم)`
          : 'غير معروف',                                                                               inline: true },
      { name: '🔮 الحالة',         value: status,                                                     inline: true },
      // ── الأدوار ──────────────────────────────────────────────────────────
      {
        name: `🏷️ الأدوار (${member.roles.cache.size - 1})`,
        value: roles.length > 0 ? roles.join(' ') + (member.roles.cache.size - 1 > 5 ? ' ...' : '') : 'لا توجد',
        inline: false,
      },
      // ── التحذيرات ─────────────────────────────────────────────────────────
      {
        name: '⚠️ التحذيرات',
        value: warnings.length === 0
          ? '✅ لا توجد تحذيرات'
          : `${warnings.length} تحذير — استخدم \`/warn list\` للتفاصيل`,
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: `⚔️ FX9-SYS  •  الملف الشخصي` });

  await interaction.reply({ embeds: [embed] });
}
