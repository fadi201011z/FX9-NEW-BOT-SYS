import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { ok, fail, logEntry } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('Give or take a role from a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Give a role to a member')
      .addUserOption(opt => opt.setName('user').setDescription('Member to give the role to').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role to give').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Take a role from a member')
      .addUserOption(opt => opt.setName('user').setDescription('Member to take the role from').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('Role to take').setRequired(true))
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.role)) return;

  const sub    = interaction.options.getSubcommand();
  const target = interaction.options.getMember('user');
  const role   = interaction.options.getRole('role');

  if (!target) return interaction.reply(fail('That member is not in this server.'));
  if (role.position >= interaction.guild.members.me.roles.highest.position) {
    return interaction.reply(fail(`I cannot manage ${role} — it sits at or above my highest role.`));
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));

  if (sub === 'add') {
    if (target.roles.cache.has(role.id)) {
      return interaction.reply(fail(`${target.user.tag} already has ${role}`));
    }
    await target.roles.add(role, `added by ${interaction.user.tag}`);
    await interaction.reply(ok(`Gave ${role} to ${target.user.tag}`));

    if (modLogCh) {
      await modLogCh.send({
        embeds: [logEntry({
          kind: 'role_add',
          target: `${target.user.tag} (\`${target.user.id}\`)`,
          actor: interaction.user.tag,
          fields: [{ name: 'Role', value: role.toString(), inline: true }],
        })],
      }).catch(() => {});
    }
    return;
  }

  if (sub === 'remove') {
    if (!target.roles.cache.has(role.id)) {
      return interaction.reply(fail(`${target.user.tag} does not have ${role}`));
    }
    await target.roles.remove(role, `removed by ${interaction.user.tag}`);
    await interaction.reply(ok(`Removed ${role} from ${target.user.tag}`));

    if (modLogCh) {
      await modLogCh.send({
        embeds: [logEntry({
          kind: 'role_remove',
          target: `${target.user.tag} (\`${target.user.id}\`)`,
          actor: interaction.user.tag,
          fields: [{ name: 'Role', value: role.toString(), inline: true }],
        })],
      }).catch(() => {});
    }
  }
}