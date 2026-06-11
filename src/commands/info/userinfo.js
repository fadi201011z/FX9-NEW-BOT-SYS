import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/embeds.js';
import { getWarnings } from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('معلومات تفصيلية عن عضو في السيرفر')
  .addUserOption(opt =>
    opt.setName('user').setDescription('العضو المراد عرض معلوماته (افتراضي: أنت)')
  );

const FLAG_LABELS = {
  Staff:                  '👨‍💼 موظف Discord',
  Partner:                '🤝 شريك',
  Hypesquad:              '🏠 HypeSquad Events',
  BugHunterLevel1:        '🐛 صائد أخطاء',
  BugHunterLevel2:        '🐛 صائد أخطاء ذهبي',
  HypeSquadOnlineHouse1:  '🏠 Bravery',
  HypeSquadOnlineHouse2:  '🏠 Brilliance',
  HypeSquadOnlineHouse3:  '🏠 Balance',
  PremiumEarlySupporter:  '⭐ داعم مبكر',
  VerifiedDeveloper:      '✅ مطور موثق',
  ActiveDeveloper:        '👨‍💻 مطور نشط',
};

export async function execute(interaction) {
  const target = interaction.options.getMember('user') ?? interaction.member;
  const user   = target.user ?? target;

  const warnings = getWarnings(interaction.guildId, user.id);
  const roles    = target.roles?.cache
    .filter(r => r.id !== interaction.guildId)
    .sort((a, b) => b.position - a.position)
    .map(r => r.toString())
    .slice(0, 10)
    .join(', ') || 'لا توجد';

  const badges = (user.flags?.toArray() ?? [])
    .map(f => FLAG_LABELS[f])
    .filter(Boolean);

  const accountAge     = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  const isNewAccount   = accountAge < 7;
  const warnColor      = warnings.length >= 3 ? Colors.ERROR : warnings.length >= 1 ? Colors.WARNING : Colors.SUCCESS;

  const embed = new EmbedBuilder()
    .setColor(isNewAccount ? Colors.WARNING : Colors.INFO)
    .setTitle(`👤  ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '🆔  المعرّف',          value: `\`${user.id}\``,                                            inline: true },
      { name: '🤖  بوت؟',             value: user.bot ? 'نعم ✅' : 'لا ❌',                              inline: true },
      { name: '🎨  لون العرض',        value: target.displayHexColor ?? '#ffffff',                         inline: true },
      { name: '📅  إنشاء الحساب',     value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,        inline: true },
      { name: '📥  انضم للسيرفر',     value: target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>` : 'غير معروف', inline: true },
      { name: '⚠️  التحذيرات',        value: `${warnings.length}`,                                       inline: true },
      { name: '🏷️  الأدوار',          value: roles.slice(0, 1024),                                       inline: false },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  معلومات العضو' });

  if (badges.length > 0) {
    embed.addFields({ name: '🏅  الشارات', value: badges.join('\n'), inline: false });
  }
  if (isNewAccount) {
    embed.addFields({ name: '⚠️  تنبيه — حساب جديد', value: `هذا الحساب عمره **${accountAge} يوم** فقط.`, inline: false });
  }

  await interaction.reply({ embeds: [embed] });
}
