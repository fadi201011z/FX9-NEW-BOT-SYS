import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { EPHEMERAL, field, logEntry, modAction, userTag } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, grantAdminAccess } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('lock')
  .setDescription('Lock a channel so members cannot post')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to lock (defaults to this one)')
      .addChannelTypes(ChannelType.GuildText)
  )
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for locking'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.lock)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const reason  = interaction.options.getString('reason') ?? 'No reason given';

  const everyoneRole = interaction.guild.roles.everyone;
  const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

  if (currentPermissions && currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({ content: `⚠️ ${channel} is already locked.`, flags: EPHEMERAL });
  }

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
  await grantAdminAccess(channel, interaction.guild, { ViewChannel: true, SendMessages: true });

  // Public in the channel the command ran in. Members and other staff both see
  // that the channel went down and why.
  await interaction.reply({
    embeds: [modAction({
      kind: 'lock',
      description: 'Members can no longer send messages here. Staff roles are unaffected.',
      target: channel.toString(),
      actor: userTag(interaction.user),
      reason,
      fields: [field('Channel', `<#${channel.id}>`, true)],
    })],
  });

  // And again in the locked channel itself, when that is a different channel,
  // so the people who lost the ability to post are told instead of guessing.
  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [modAction({
        kind: 'lock',
        description: 'Members can no longer send messages here. Staff roles are unaffected.',
        reason,
        fields: [field('Locked by', userTag(interaction.user), true)],
      })],
    }).catch(() => {});
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'lock',
        target: channel.toString(),
        actor: userTag(interaction.user),
        reason,
      })],
    }).catch(() => {});
  }
}