import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { ok, fail, notice, logEntry, field, C, EPHEMERAL } from '../../utils/embeds.js';
import { addWarning, getWarnings, clearWarnings, getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warnings — add, list or clear a member’s warnings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Warn a member')
      .addUserOption(opt => opt.setName('user').setDescription('Member to warn').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Show a member’s warnings')
      .addUserOption(opt => opt.setName('user').setDescription('Member to check').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('clear')
      .setDescription('Clear all of a member’s warnings')
      .addUserOption(opt => opt.setName('user').setDescription('Member to clear').setRequired(true))
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.warn)) return;

  const sub    = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user');

  if (sub === 'add') {
    const reason   = interaction.options.getString('reason');
    addWarning(interaction.guildId, target.id, interaction.user.id, reason);
    const warnings = getWarnings(interaction.guildId, target.id);

    try {
      await target.send({
        embeds: [notice({
          title: `You have been warned in ${interaction.guild.name}`,
          description: `**Reason:** ${reason}\n**Total warnings:** ${warnings.length}`,
          color: C.warn,
          thumbnail: interaction.guild.iconURL({ dynamic: true }),
        })],
      });
    } catch { /* DMs are closed */ }

    await interaction.reply(ok(`Warned ${target.tag} · ${warnings.length} total warning${warnings.length === 1 ? '' : 's'}`));

    const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
    if (modLogCh) {
      await modLogCh.send({
        embeds: [logEntry({
          kind: 'warn',
          target: `${target.tag} (\`${target.id}\`)`,
          actor: interaction.user.tag,
          reason,
          fields: [field('Total warnings', `${warnings.length}`)],
        })],
      }).catch(() => {});
    }
    return;
  }

  if (sub === 'list') {
    const warnings = getWarnings(interaction.guildId, target.id);
    if (warnings.length === 0) {
      return interaction.reply({ ...fail(`${target.tag} has no recorded warnings.`), flags: EPHEMERAL });
    }

    // This one earns its embed — it is a table the moderator has to read.
    const fields = warnings.slice(0, 10).map((w, i) => ({
      name: `#${i + 1} — <t:${Math.floor(w.timestamp / 1000)}:d>`,
      value: `**Reason:** ${w.reason}\n**Moderator:** <@${w.moderatorId}>`,
      inline: false,
    }));

    return interaction.reply({
      embeds: [notice({
        title: `Warnings for ${target.tag}`,
        description: `**${warnings.length}** warning${warnings.length === 1 ? '' : 's'} on record${warnings.length > 10 ? ` · showing the first 10` : ''}.`,
        color: C.warn,
        fields,
        thumbnail: target.displayAvatarURL({ dynamic: true }),
      })],
      flags: EPHEMERAL,
    });
  }

  if (sub === 'clear') {
    const had = getWarnings(interaction.guildId, target.id).length;
    clearWarnings(interaction.guildId, target.id);
    return interaction.reply(ok(had > 0 ? `Cleared ${had} warning${had === 1 ? '' : 's'} for ${target.tag}` : `${target.tag} had no warnings to clear`));

    // Nothing is logged here on purpose: a no-op clear would put noise in the
    // modlog for something that changed nothing.
  }
}