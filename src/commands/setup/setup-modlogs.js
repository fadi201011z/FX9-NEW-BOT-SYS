import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { setConfig } from '../../database.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('setup-modlogs')
  .setDescription('تعيين قناة سجلات الإشراف — ban/kick/timeout/warn والقنوات والأدوار')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة التي تُسجَّل فيها أوامر الإشراف')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel');
  setConfig(interaction.guildId, 'modlog_channel', channel.id);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.RED)
        .setTitle('🔨  تم تعيين قناة سجلات الإشراف')
        .setDescription(`جميع أوامر الإشراف ستُسجَّل في ${channel}`)
        .addFields(
          {
            name: '📋  ما يُسجَّل هنا',
            value: [
              '> 🔨 `/ban` — تفاصيل الحظر',
              '> 👢 `/kick` — تفاصيل الطرد',
              '> ⏱️ `/timeout` — الإيقاف المؤقت',
              '> ⚠️ `/warn` — التحذيرات الصادرة',
              '> 🔒 `/lock` `/hide` — إغلاق/إخفاء القنوات',
              '> 🏷️ `/role` — تغيير الأدوار',
              '> 📌 إنشاء وحذف القنوات',
              '> 🚨 Anti-Nuke / Raid Alerts',
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
