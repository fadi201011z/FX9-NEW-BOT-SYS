import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { notice, logEntry, field, C } from '../../utils/embeds.js';
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
    return interaction.reply({ content: `⚠️ ${channel} is already locked.`, flags: 64 });
  }

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
  await grantAdminAccess(channel, interaction.guild, { ViewChannel: true, SendMessages: true });

  await interaction.reply({ content: `🔒 Locked ${channel} · ${reason}`, flags: 64 });

  // Public notice in the channel itself — this one earns an embed, because
  // everyone in the channel needs to understand why they can no longer post.
  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [notice({
        title: '🔒 This channel is locked',
        description: 'Members can no longer send messages here. Staff roles are unaffected.',
        color: C.error,
        fields: [field('Reason', reason, false)],
        footer: 'Kratos System',
        timestamp: true,
      })],
    }).catch(() => {});
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'lock',
        target: channel.toString(),
        actor: interaction.user.tag,
        reason,
      })],
    }).catch(() => {});
  }
}