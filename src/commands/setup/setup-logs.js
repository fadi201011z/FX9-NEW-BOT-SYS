import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../../database.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';
import { channelSetReply } from '../../utils/setupReply.js';

export const data = new SlashCommandBuilder()
  .setName('setup-logs')
  .setDescription('Set the server log channel — joins, messages, voice, nicknames')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt.setName('channel')
      .setDescription('Channel that records general activity')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel', true);
  setConfig(interaction.guildId, 'log_channel', channel.id);

  await interaction.reply(channelSetReply({
    title: 'Server log channel set',
    emoji: '📋',
    channels: [{ label: '📢 Channel', mention: channel.toString(), id: channel.id }],
    records: 'joins and leaves · message edits and deletes · voice channel activity · nickname changes',
    tip: 'Use `/setup-modlogs` for moderation actions and `/setup-botlogs` for the bot itself.',
  }));
}