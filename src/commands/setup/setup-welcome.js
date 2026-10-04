import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../../database.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';
import { channelSetReply } from '../../utils/setupReply.js';

export const data = new SlashCommandBuilder()
  .setName('setup-welcome')
  .setDescription('Set the welcome channel — a card is posted for every new member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt.setName('channel')
      .setDescription('Channel that receives welcome messages')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel', true);
  setConfig(interaction.guildId, 'welcome_channel', channel.id);

  await interaction.reply(channelSetReply({
    title: 'Welcome channel set',
    emoji: '👋',
    channels: [{ label: '📢 Channel', mention: channel.toString(), id: channel.id }],
    records: 'the member’s avatar · a welcome ping by name · their member number · '
      + 'an automatic warning when the account is less than 7 days old',
    tip: 'The auto-role is configured from the dashboard, under server settings.',
  }));
}