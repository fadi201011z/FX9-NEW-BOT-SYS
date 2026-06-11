import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { setConfig } from '../../database.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('setup-welcome')
  .setDescription('تعيين قناة الترحيب — تُرسَل فيها بطاقة ترحيب عند انضمام كل عضو')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة التي ستُرسَل فيها رسائل الترحيب')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel');
  setConfig(interaction.guildId, 'welcome_channel', channel.id);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.WHITE)
        .setTitle('👋  تم تعيين قناة الترحيب')
        .setDescription(`رسائل الترحيب ستُرسَل إلى ${channel}`)
        .addFields(
          {
            name: '🎨  محتوى بطاقة الترحيب',
            value: [
              '> 🖼️ صورة العضو الشخصية',
              '> 👋 منشن ترحيب باسم العضو',
              '> 📊 رقم العضو في السيرفر',
              '> ⚠️ تنبيه تلقائي إذا كان الحساب جديداً (أقل من 7 أيام)',
            ].join('\n'),
            inline: false,
          },
          { name: '📢  القناة المحددة', value: `${channel} (\`${channel.id}\`)`, inline: true }
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: '⚔️ FX9-SYS  •  الإعداد' })
    ],
    flags: EPHEMERAL,
  });
}
