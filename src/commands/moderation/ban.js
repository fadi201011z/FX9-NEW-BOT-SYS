import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { ok, fail, notice, logEntry, field, C } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member and notify them')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(opt => opt.setName('user').setDescription('Member to ban').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban'))
  .addIntegerOption(opt => opt.setName('delete_days').setDescription('Days of their messages to delete (0-7)').setMinValue(0).setMaxValue(7));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.ban)) return;

  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') ?? 'No reason given';
  const days   = interaction.options.getInteger('delete_days') ?? 0;

  if (!target) return interaction.reply(fail('That member is not in this server.'));
  if (!canModerate(interaction.guild, target)) return interaction.reply(fail('I cannot ban this member — their role is above mine.'));

  // Tell them first, while they can still read it.
  try {
    await target.send({
      embeds: [notice({
        title: `You have been banned from ${interaction.guild.name}`,
        description: `**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`,
        color: C.error,
        thumbnail: interaction.guild.iconURL({ dynamic: true }),
      })],
    });
  } catch { /* DMs are closed */ }

  await target.ban({ reason: `${interaction.user.tag}: ${reason}`, deleteMessageDays: days });

  await interaction.reply(ok(`Banned ${target.user.tag}${days > 0 ? ` · deleted ${days} day${days > 1 ? 's' : ''} of messages` : ''}`));

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'ban',
        target: `${target.user.tag} (\`${target.user.id}\`)`,
        actor: interaction.user.tag,
        reason,
        fields: [field('Messages deleted', `${days} day${days === 1 ? '' : 's'}`)],
      })],
    }).catch(() => {});
  }
}