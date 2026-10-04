import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { ok, logEntry } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, grantAdminAccess } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('hide')
  .setDescription('Hide a channel from regular members')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to hide (defaults to this one)')
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.hide)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  // 1) Hide it from @everyone
  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    ViewChannel: false,
  });

  // 2) Explicitly grant every admin role View + Send, so hiding a channel can
  //    never lock the staff out of their own server.
  await grantAdminAccess(channel, interaction.guild, {
    ViewChannel:  true,
    SendMessages: true,
  });

  await interaction.reply(ok(`Hidden ${channel} — regular members can no longer see it, staff roles still can.`));

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'hide',
        target: channel.toString(),
        actor: interaction.user.tag,
      })],
    }).catch(() => {});
  }
}