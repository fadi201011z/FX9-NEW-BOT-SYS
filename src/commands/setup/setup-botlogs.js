import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { setConfig } from '../../database.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('setup-botlogs')
  .setDescription('تعيين قناة سجل البوت — تُرسَل فيها إشعارات التشغيل والإيقاف والأخطاء والحالة')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة التي ستصلها إشعارات البوت')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel');
  setConfig(interaction.guildId, 'botlog_channel', channel.id);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.WHITE)
        .setTitle('🤖  تم تعيين قناة سجل البوت')
        .setDescription(`سيتم إرسال جميع إشعارات البوت إلى ${channel}`)
        .addFields(
          {
            name: '📋  ما يُرسَل هنا',
            value: [
              '🟢 **البوت أونلاين** — عند بدء التشغيل مع إحصائيات كاملة',
              '🔴 **البوت أوفلاين** — عند الإيقاف المنظّم (SIGTERM/SIGINT)',
              '🚨 **خطأ غير متوقع** — عند حدوث استثناء مع تفاصيل الخطأ',
              '📊 **تقرير الحالة** — كل 10 دقائق (ping، ذاكرة، أعضاء، وقت التشغيل)',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💡  نصيحة',
            value: 'استخدم قناة خاصة لمشرفي البوت فقط.',
            inline: false,
          }
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: '⚔️ FX9-SYS  •  الإعداد' })
    ],
    flags: EPHEMERAL,
  });
}
