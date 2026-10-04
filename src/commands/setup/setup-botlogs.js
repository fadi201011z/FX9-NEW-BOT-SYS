import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../../database.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';
import { channelSetReply } from '../../utils/setupReply.js';

export const data = new SlashCommandBuilder()
  .setName('setup-botlogs')
  .setDescription('Set the bot log channel — startup, shutdown, errors, status reports')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((opt) =>
    opt.setName('channel')
      .setDescription('Channel that receives bot notifications')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  const channel = interaction.options.getChannel('channel', true);
  setConfig(interaction.guildId, 'botlog_channel', channel.id);

  await interaction.reply(channelSetReply({
    title: 'Bot log channel set',
    emoji: '🤖',
    channels: [{ label: '📢 Channel', mention: channel.toString(), id: channel.id }],
    records: '🟢 **Online** — on startup, with full statistics\n'
      + '🔴 **Offline** — on a clean shutdown (SIGTERM/SIGINT)\n'
      + '🚨 **Error** — any unhandled exception, with its details\n'
      + '📊 **Status report** — every 10 minutes: latency, memory, members, uptime',
    tip: 'Keep this channel private — it is for bot administrators, not the whole staff team.',
  }));
}