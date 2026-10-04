import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { modAction, logEntry, userTag } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, clearAdminOverwrites } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('unhide')
  .setDescription('Make a hidden channel visible to regular members again')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to show (defaults to this one)')
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.unhide)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  // 1) Reset @everyone (null = inherit from the category or server)
  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    ViewChannel: null,
  });

  // 2) Drop the explicit overwrites /hide added for admin roles
  await clearAdminOverwrites(channel, interaction.guild);

  await interaction.reply({
    embeds: [modAction({
      kind: 'unhide',
      description: 'Regular members can see this channel again.',
      target: channel.toString(),
      actor: userTag(interaction.user),
    })],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'unhide',
        target: channel.toString(),
        actor: userTag(interaction.user),
      })],
    }).catch(() => {});
  }
}