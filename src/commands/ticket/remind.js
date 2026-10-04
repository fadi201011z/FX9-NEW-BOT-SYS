import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { getTicket, getTicketByAdminChannel, getGuildConfig } from '../../data/ticketDB.js';
import { ok, fail, notice, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('⏰ Nudge the member to reply on this ticket')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addStringOption((o) =>
    o.setName('message')
      .setDescription('Custom message (optional)')
      .setRequired(false)
      .setMaxLength(300));

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const ticket = getTicket(interaction.channelId)
    ?? getTicketByAdminChannel(interaction.channelId);

  if (!ticket) return interaction.editReply({ content: '❌ This command only works inside a ticket channel.' });
  if (ticket.status === 'closed') return interaction.editReply({ content: '❌ This ticket is closed.' });

  // Support roles are configured per server, so this cannot rely on a hardcoded
  // list the way the moderation commands can.
  const config    = getGuildConfig(interaction.guildId);
  const member    = await interaction.guild.members.fetch(interaction.user.id);
  const isSupport = member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    || (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id));

  if (!isSupport) return interaction.editReply(fail('Only the support team can use this command.'));

  const custom = interaction.options.getString('message');

  // Posted in the member's channel, so it earns an embed — a support nudge is
  // something the member needs to be able to scroll back to.
  const embed = notice({
    title: '⏰ Reminder — please reply',
    description: [
      `<@${ticket.userId}>`,
      custom
        ? `📣 **Message from the support team:**\n> ${custom}`
        : '📣 **The support team is waiting for your reply on this ticket.**\n'
          + 'Please respond as soon as you can.',
      `> Ticket: \`${ticket.ticketId}\` · if there is no reply, this ticket closes automatically.`,
    ].join('\n'),
    color: C.warn,
    footer: `Kratos System • Sent by ${interaction.user.username}`,
    timestamp: true,
  });

  const userCh = interaction.client.channels.cache.get(ticket.channelId);
  if (userCh) await userCh.send({ content: `<@${ticket.userId}>`, embeds: [embed] }).catch(() => {});

  if (ticket.adminChannelId) {
    const adminCh = interaction.client.channels.cache.get(ticket.adminChannelId);
    await adminCh?.send({ embeds: [embed] }).catch(() => {});
  }

  await interaction.editReply(ok(`Reminder sent to <@${ticket.userId}>.`));
}