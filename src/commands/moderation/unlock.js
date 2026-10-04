import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { EPHEMERAL, logEntry, modAction, userTag } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, clearAdminOverwrites } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('Unlock a channel so members can post again')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to unlock (defaults to this one)')
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.unlock)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  const everyoneRole = interaction.guild.roles.everyone;
  const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

  if (!currentPermissions || !currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({ content: `⚠️ ${channel} is already unlocked.`, flags: EPHEMERAL });
  }

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
  await clearAdminOverwrites(channel, interaction.guild);

  await interaction.reply({
    embeds: [modAction({
      kind: 'unlock',
      description: 'Members can send messages here again.',
      target: channel.toString(),
      actor: userTag(interaction.user),
    })],
  });

  // And again in the reopened channel when it is a different channel, so the
  // people who could not post are told why it opened.
  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [modAction({
        kind: 'unlock',
        description: 'Members can send messages here again.',
        fields: [{ name: 'Opened by', value: userTag(interaction.user), inline: true }],
      })],
    }).catch(() => {});
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'unlock',
        target: channel.toString(),
        actor: userTag(interaction.user),
      })],
    }).catch(() => {});
  }
}