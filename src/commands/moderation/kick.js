import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { fail, notice, modAction, logEntry, C, userTag } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member and notify them')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption(opt => opt.setName('user').setDescription('Member to kick').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.kick)) return;

  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') ?? 'No reason given';

  if (!target) return interaction.reply(fail('That member is not in this server.'));
  if (!canModerate(interaction.guild, target)) return interaction.reply(fail('I cannot kick this member — their role is above mine.'));

  // Tell them first, while they can still read it.
  try {
    await target.send({
      embeds: [notice({
        title: `You have been kicked from ${interaction.guild.name}`,
        description: `**Reason:** ${reason}\n**Moderator:** ${userTag(interaction.user)}`,
        color: C.warn,
        thumbnail: interaction.guild.iconURL({ dynamic: true }),
      })],
    });
  } catch { /* DMs are closed */ }

  await target.kick(`${userTag(interaction.user)}: ${reason}`);

  await interaction.reply({
    embeds: [modAction({
      kind: 'kick',
      target: `${userTag(target.user)} (\`${target.user.id}\`)`,
      actor: userTag(interaction.user),
      reason,
    })],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'kick',
        target: `${userTag(target.user)} (\`${target.user.id}\`)`,
        actor: userTag(interaction.user),
        reason,
      })],
    }).catch(() => {});
  }
}