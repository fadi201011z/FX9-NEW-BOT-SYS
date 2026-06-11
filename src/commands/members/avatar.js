import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription('عرض صورة عضو بأعلى دقة ممكنة')
  .addUserOption(opt =>
    opt.setName('user').setDescription('العضو المراد عرض صورته (الافتراضي: أنت)')
  );

export async function execute(interaction) {
  const member = interaction.options.getMember('user') ?? interaction.member;
  const user   = member.user;

  // صورة السيرفر (إذا وجدت) + صورة الحساب
  const serverAvatar  = member.displayAvatarURL({ dynamic: true, size: 4096 });
  const globalAvatar  = user.displayAvatarURL({ dynamic: true, size: 4096 });
  const isGif         = serverAvatar.includes('.gif') || globalAvatar.includes('.gif');

  const embed = new EmbedBuilder()
    .setColor(Colors.DARK)
    .setTitle(`🖼️  صورة ${user.tag}`)
    .setImage(serverAvatar)
    .addFields(
      { name: '📥 تنزيل الصورة', value: `[PNG](${user.displayAvatarURL({ format: 'png', size: 4096 })}) • [WebP](${globalAvatar}) ${isGif ? `• [GIF](${serverAvatar})` : ''}`, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  صورة العضو' });

  // إذا كانت صورة السيرفر مختلفة عن الصورة العامة
  if (serverAvatar !== globalAvatar) {
    embed.addFields({
      name: '🌐 الصورة العامة للحساب',
      value: `[اضغط هنا للعرض](${globalAvatar})`,
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed] });
}
