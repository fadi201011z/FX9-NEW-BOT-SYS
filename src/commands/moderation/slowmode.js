import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { modAction, logEntry, field, userTag } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('Set the slowmode delay in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption(opt =>
    opt.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.slowmode)) return;

  const seconds  = interaction.options.getInteger('seconds');
  const disabled = seconds === 0;
  await interaction.channel.setRateLimitPerUser(seconds);

  await interaction.reply({
    embeds: [modAction({
      kind: 'slowmode',
      description: disabled
        ? 'Slowmode is off — members can post freely again.'
        : `Members must wait ${seconds}s between messages in this channel.`,
      target: interaction.channel.toString(),
      actor: userTag(interaction.user),
      fields: [field('Delay', disabled ? 'Disabled' : `${seconds}s`)],
    })],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'slowmode',
        target: interaction.channel.toString(),
        actor: userTag(interaction.user),
        fields: [field('Delay', disabled ? 'Disabled' : `${seconds}s`)],
      })],
    }).catch(() => {});
  }
}