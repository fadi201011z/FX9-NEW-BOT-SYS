import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { ok, fail, logEntry, field } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('nick')
  .setDescription("Change or reset a member's nickname")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
  .addUserOption(opt => opt.setName('user').setDescription('Member to rename').setRequired(true))
  .addStringOption(opt => opt.setName('nickname').setDescription('New nickname (leave empty to reset)'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.nick)) return;

  const target   = interaction.options.getMember('user');
  const nickname = interaction.options.getString('nickname') ?? null;

  if (!target) return interaction.reply(fail('That member is not in this server.'));
  if (!canModerate(interaction.guild, target)) return interaction.reply(fail('I cannot rename this member.'));

  const oldNick  = target.nickname ?? target.user.username;
  const newNick  = nickname ?? target.user.username;
  await target.setNickname(nickname, `by ${interaction.user.tag}`);

  await interaction.reply(ok(`Nickname for ${target.user.tag} changed to **${newNick}**`));

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'nick',
        target: `${target.user.tag} (\`${target.user.id}\`)`,
        actor: interaction.user.tag,
        fields: [field('Before', oldNick), field('After', newNick)],
      })],
    }).catch(() => {});
  }
}