import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, clearAdminOverwrites } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('unhide')
  .setDescription('إظهار قناة مخفية للأعضاء العاديين')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة المراد إظهارها (الافتراضي: الحالية)')
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.unhide)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  // 1) إعادة @everyone لوضعه الافتراضي (null = وراثة من التصنيف/السيرفر)
  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    ViewChannel: null,
  });

  // 2) مسح الـ overrides الصريحة التي أضافها /hide للرتب الإدارية
  await clearAdminOverwrites(channel, interaction.guild);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.WHITE)
        .setTitle('✅  تم إظهار القناة')
        .addFields(
          { name: '📢  القناة',  value: `${channel}`,          inline: true },
          { name: '🛡️  بواسطة', value: `${interaction.user}`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: '⚔️ FX9-SYS  •  إدارة القنوات' }),
    ],
    flags: EPHEMERAL,
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.WHITE)
          .setTitle('✅  إظهار قناة')
          .addFields(
            { name: '📢  القناة',  value: `${channel}`,          inline: true },
            { name: '🛡️  المشرف', value: `${interaction.user}`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' }),
      ],
    }).catch(() => {});
  }
}
