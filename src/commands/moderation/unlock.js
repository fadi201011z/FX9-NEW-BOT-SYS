import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { notice, logEntry, C } from '../../utils/embeds.js';
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
    return interaction.reply({ content: `⚠️ ${channel} is already unlocked.`, flags: 64 });
  }

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
  await clearAdminOverwrites(channel, interaction.guild);

  await interaction.reply({ content: `🔓 Unlocked ${channel} — members can post again.`, flags: 64 });

  // Public notice, same reasoning as /lock.
  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [notice({
        title: '🔓 This channel is open again',
        description: 'Members can send messages here again.',
        color: C.ok,
        footer: 'Kratos System',
        timestamp: true,
      })],
    }).catch(() => {});
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'unlock',
        target: channel.toString(),
        actor: interaction.user.tag,
      })],
    }).catch(() => {});
  }
}