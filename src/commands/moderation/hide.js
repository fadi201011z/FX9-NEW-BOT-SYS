import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, grantAdminAccess } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('hide')
  .setDescription('إخفاء قناة عن الأعضاء العاديين')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة المراد إخفاؤها (الافتراضي: الحالية)')
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.hide)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  // 1) إخفاء القناة عن @everyone
  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    ViewChannel: false,
  });

  // 2) منح جميع الرتب الإدارية رؤية وإرسال صريحَين حتى لا تختفي عنهم
  await grantAdminAccess(channel, interaction.guild, {
    ViewChannel:  true,
    SendMessages: true,
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.DARK)
        .setTitle('👁️  تم إخفاء القناة')
        .setDescription('> الأعضاء العاديون لا يرون القناة.\n> الرتب الإدارية لا تزال ترى القناة وتكتب فيها.')
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
          .setColor(Colors.DARK)
          .setTitle('👁️  إخفاء قناة')
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
