import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { ok, fail, logEntry, field } from '../../utils/embeds.js';
import { parseDuration, formatDuration } from '../../utils/parseDuration.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Temporarily mute a member for a set duration')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(opt => opt.setName('user').setDescription('Member to time out').setRequired(true))
  .addStringOption(opt => opt.setName('duration').setDescription('Duration, e.g. 10m, 1h, 2d').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for the timeout'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.timeout)) return;

  const target      = interaction.options.getMember('user');
  const durationStr = interaction.options.getString('duration');
  const reason      = interaction.options.getString('reason') ?? 'No reason given';
  const durationMs  = parseDuration(durationStr);

  if (!target)     return interaction.reply(fail('That member is not in this server.'));
  if (!durationMs) return interaction.reply(fail('Invalid duration. Try `10m`, `1h` or `2d`.'));
  if (durationMs > 28 * 24 * 60 * 60 * 1000) return interaction.reply(fail('That duration is too long — the maximum is **28 days**.'));
  if (!canModerate(interaction.guild, target)) return interaction.reply(fail('I cannot time out this member — their role is above mine.'));

  const until = new Date(Date.now() + durationMs);
  await target.timeout(durationMs, `${interaction.user.tag}: ${reason}`);

  const extra = [
    field('Duration', formatDuration(durationMs)),
    field('Expires', `<t:${Math.floor(until.getTime() / 1000)}:R>`),
  ];

  await interaction.reply(ok(`Timed out ${target.user.tag} for ${formatDuration(durationMs)}`));

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'timeout',
        target: `${target.user.tag} (\`${target.user.id}\`)`,
        actor: interaction.user.tag,
        reason,
        fields: extra,
      })],
    }).catch(() => {});
  }
}