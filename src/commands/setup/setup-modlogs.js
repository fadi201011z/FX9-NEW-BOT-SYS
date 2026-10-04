import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../../database.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';
import { channelSetReply } from '../../utils/setupReply.js';

export const data = new SlashCommandBuilder()
  .setName('setup-modlogs')
  .setDescription('Set the modlog channel — bans, kicks, timeouts, warnings, channels, roles')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt.setName('channel')
      .setDescription('Channel that records moderation actions')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel', true);
  setConfig(interaction.guildId, 'modlog_channel', channel.id);

  await interaction.reply(channelSetReply({
    title: 'Modlog channel set',
    emoji: '🔨',
    channels: [{ label: '📢 Channel', mention: channel.toString(), id: channel.id }],
    records: '`/ban` · `/kick` · `/timeout` · `/warn` · `/clear` · `/lock` `/hide` · `/role` · `/nick` · channel and role changes · anti-nuke and raid alerts',
    tip: 'Use `/setup-logs` for general activity and `/setup-botlogs` for the bot itself.',
  }));
}