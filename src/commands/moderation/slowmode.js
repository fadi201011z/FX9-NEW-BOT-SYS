import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('ضبط وضع البطء في القناة الحالية')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption(opt =>
    opt.setName('seconds').setDescription('المدة بالثواني (0 لتعطيل)').setRequired(true).setMinValue(0).setMaxValue(21600)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.slowmode)) return;

  const seconds  = interaction.options.getInteger('seconds');
  const disabled = seconds === 0;
  await interaction.channel.setRateLimitPerUser(seconds);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(disabled ? Colors.WHITE : Colors.WARNING)
        .setTitle(disabled ? '🔓  تم تعطيل وضع البطء' : '🐢  تم تفعيل وضع البطء')
        .addFields(
          { name: '📢 القناة',  value: `${interaction.channel}`,                              inline: true },
          { name: '⏱️ المدة',  value: disabled ? 'معطّل' : `${seconds} ثانية بين كل رسالة`, inline: true },
          { name: '🛡️ بواسطة', value: `${interaction.user}`,                                 inline: true },
        )
        .setTimestamp()
        .setFooter({ text: '⚔️ FX9-SYS  •  إدارة القنوات' })
    ],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(disabled ? Colors.WHITE : Colors.WARNING)
          .setTitle('🐢  تغيير وضع البطء')
          .addFields(
            { name: '📢 القناة',  value: `${interaction.channel}`,                  inline: true },
            { name: '⏱️ المدة',  value: disabled ? 'معطّل' : `${seconds} ثانية`,  inline: true },
            { name: '🛡️ المشرف', value: `${interaction.user}`,                      inline: true },
          )
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
      ],
    }).catch(() => {});
  }
}
