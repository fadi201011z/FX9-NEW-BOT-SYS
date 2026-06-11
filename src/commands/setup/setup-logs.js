import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { setConfig } from '../../database.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('setup-logs')
  .setDescription('تعيين قناة السجلات العامة — الانضمام والمغادرة والرسائل والصوت')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة التي تُسجَّل فيها الأحداث العامة')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel');
  setConfig(interaction.guildId, 'log_channel', channel.id);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.WHITE)
        .setTitle('📋  تم تعيين قناة السجلات العامة')
        .setDescription(`الأحداث العامة ستُسجَّل في ${channel}`)
        .addFields(
          {
            name: '📋  ما يُسجَّل هنا',
            value: [
              '> 📥 انضمام وخروج الأعضاء',
              '> ✏️ تعديل وحذف الرسائل',
              '> 🎤 دخول وخروج القنوات الصوتية',
              '> 🏷️ تغيير اللقب (nickname)',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💡  نصيحة',
            value: 'استخدم `/setup-modlogs` لسجل أوامر الإشراف، و`/setup-botlogs` لسجل البوت.',
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
