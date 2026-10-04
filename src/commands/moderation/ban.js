import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { fail, notice, modAction, logEntry, field, C, userTag } from '../../utils/embeds.js';
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
        description: `**Reason:** ${reason}\n**Moderator:** ${userTag(interaction.user)}`,
        color: C.error,
        thumbnail: interaction.guild.iconURL({ dynamic: true }),
      })],
    });
  } catch { /* DMs are closed */ }

  await target.ban({ reason: `${userTag(interaction.user)}: ${reason}`, deleteMessageDays: days });

  // Public: the ban is a channel-wide fact, not a private note to the moderator.
  await interaction.reply({
    embeds: [modAction({
      kind: 'ban',
      target: `${userTag(target.user)} (\`${target.user.id}\`)`,
      actor: userTag(interaction.user),
      reason,
      fields: days > 0 ? [field('Messages deleted', `${days} day${days === 1 ? '' : 's'}`)] : [],
    })],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'ban',
        target: `${userTag(target.user)} (\`${target.user.id}\`)`,
        actor: userTag(interaction.user),
        reason,
        fields: [field('Messages deleted', `${days} day${days === 1 ? '' : 's'}`)],
      })],
    }).catch(() => {});
  }
}