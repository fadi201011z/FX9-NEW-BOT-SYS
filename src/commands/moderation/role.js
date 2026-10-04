import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { fail, modAction, logEntry, field, userTag } from '../../utils/embeds.js';
import { markSelfAction, roleChangeKey } from '../../utils/recentAction.js';
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
  // `COMMAND_ROLES.role` does not exist — passing it undefined made
  // requireRole() crash on `allowedRoles.filter(...)` for everyone who was
  // neither the guild owner nor an Administrator, so /role 500'd for ordinary
  // moderators. The allow-list key for this command is `manage_roles`.
  if (!await requireRole(interaction, COMMAND_ROLES.manage_roles)) return;

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
      return interaction.reply(fail(`${userTag(target.user)} already has ${role}`));
    }
    // Discord answers with a GUILD_MEMBER_UPDATE a moment after this returns,
    // and the event handler logs role changes to the same modlog. Declaring the
    // change here keeps the modlog to one entry per action — see utils/recentAction.js.
    markSelfAction(roleChangeKey(interaction.guildId, target.id));
    await target.roles.add(role, `added by ${userTag(interaction.user)}`);
    await interaction.reply({
      embeds: [modAction({
        kind: 'role_add',
        target: `${userTag(target.user)} (\`${target.user.id}\`)`,
        actor: userTag(interaction.user),
        fields: [field('Role', role.toString())],
      })],
    });

    if (modLogCh) {
      await modLogCh.send({
        embeds: [logEntry({
          kind: 'role_add',
          target: `${userTag(target.user)} (\`${target.user.id}\`)`,
          actor: userTag(interaction.user),
          fields: [field('Role', role.toString())],
        })],
      }).catch(() => {});
    }
    return;
  }

  if (sub === 'remove') {
    if (!target.roles.cache.has(role.id)) {
      return interaction.reply(fail(`${userTag(target.user)} does not have ${role}`));
    }
    // Same reasoning as the add branch above.
    markSelfAction(roleChangeKey(interaction.guildId, target.id));
    await target.roles.remove(role, `removed by ${userTag(interaction.user)}`);
    await interaction.reply({
      embeds: [modAction({
        kind: 'role_remove',
        target: `${userTag(target.user)} (\`${target.user.id}\`)`,
        actor: userTag(interaction.user),
        fields: [field('Role', role.toString())],
      })],
    });

    if (modLogCh) {
      await modLogCh.send({
        embeds: [logEntry({
          kind: 'role_remove',
          target: `${userTag(target.user)} (\`${target.user.id}\`)`,
          actor: userTag(interaction.user),
          fields: [field('Role', role.toString())],
        })],
      }).catch(() => {});
    }
  }
}