import { PermissionsBitField } from 'discord.js';
import {
  getTicket, saveTicket, getAdminStats, saveAdminStats,
  getGuildConfig, getTicketByAdminChannel, getTicketById,
} from '../data/ticketDB.js';
import { closeEmbed, ratingEmbed, ratingButtons, notice, C } from '../utils/embeds.js';
import { sendOrUpdateTicketLog } from '../utils/ticketLogUtils.js';

const AUTO_CLOSE_DELAY = 20 * 60 * 1000;
const closeTimers = new Map();

async function deleteChannels(client, ticket) {
  const userCh = client.channels.cache.get(ticket.channelId);
  await userCh?.delete().catch(() => null);
  if (ticket.adminChannelId) {
    const adminCh = client.channels.cache.get(ticket.adminChannelId);
    await adminCh?.delete().catch(() => null);
  }
  closeTimers.delete(ticket.ticketId);
}

export async function handleCloseTicket(client, interaction) {
  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  if (!ticket) {
    return interaction.reply({ content: '❌ This channel is not a ticket.', flags: 64 });
  }

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    || (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id));

  if (!isAdmin && ticket.userId !== interaction.user.id) {
    return interaction.reply({
      content: '❌ You do not have permission to close this ticket.',
      flags: 64,
    });
  }

  const isSelect = interaction.isStringSelectMenu?.() ?? false;
  if (isSelect) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: 64 });

  ticket.status = 'closed';
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.id;
  await saveTicket(ticket);

  if (ticket.claimedBy) {
    const stats = getAdminStats(ticket.claimedBy);
    stats.username = ticket.claimedByUsername ?? 'Unknown';
    stats.closed = (stats.closed ?? 0) + 1;
    await saveAdminStats(stats);
  }

  const closeMsg = closeEmbed(ticket, interaction.user.id);

  const ratingPayload = {
    embeds: [ratingEmbed(ticket.ticketId, ticket.claimedByUsername)],
    components: [ratingButtons(ticket.ticketId)],
  };

  // Prefer DM so the rating is answered privately — a public rating invites
  // peer pressure. Fall back to the channel when DMs are closed.
  let ratingInChannel = false;
  try {
    const dmUser = await client.users.fetch(ticket.userId, { force: true });
    const dmChannel = await dmUser.createDM();
    await dmChannel.send(ratingPayload);
  } catch {
    ratingInChannel = true;
  }

  const userCh = client.channels.cache.get(ticket.channelId);
  if (userCh) {
    await userCh.send({ embeds: [closeMsg] });

    if (ratingInChannel) {
      await userCh.send({
        content: `<@${ticket.userId}> ⭐ **Rate your experience** using the buttons below — `
          + 'this channel deletes itself in **20 minutes**.',
        ...ratingPayload,
      });
    }
  }

  if (ticket.adminChannelId) {
    const adminCh = client.channels.cache.get(ticket.adminChannelId);
    if (adminCh) await adminCh.send({ embeds: [closeMsg] });
  }

  await sendOrUpdateTicketLog(client, ticket);

  const confirmation = '✅ Ticket closed. The channel is deleted after the rating, '
    + 'or within 20 minutes.';

  if (isSelect) await interaction.followUp({ content: confirmation, flags: 64 });
  else await interaction.editReply({ content: confirmation });

  // Restarts the countdown rather than stacking a second timer.
  if (closeTimers.has(ticket.ticketId)) clearTimeout(closeTimers.get(ticket.ticketId));
  closeTimers.set(
    ticket.ticketId,
    setTimeout(() => deleteChannels(client, ticket), AUTO_CLOSE_DELAY),
  );
}

const RATING_LABELS = { 1: 'Very poor', 2: 'Poor', 3: 'Acceptable', 4: 'Good', 5: 'Excellent' };
const RATING_COLORS = { 1: C.error, 2: 0xf97316, 3: C.warn, 4: C.ok, 5: 0x10b981 };
const RATING_EMOJI  = { 1: '😞', 2: '😕', 3: '😐', 4: '😊', 5: '🤩' };

export async function handleRatingButton(client, interaction) {
  // customId is `rate_<n>_<ticketId>`, and ticket ids contain hyphens, so the
  // rating is taken from the first segment and everything after it is the id.
  const parts    = interaction.customId.split('_');
  const rating   = parseInt(parts[1], 10);
  const ticketId = parts.slice(2).join('_');

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    try { await interaction.reply({ content: '❌ That ticket does not exist.', flags: 64 }); } catch { /* expired */ }
    return;
  }

  if (ticket.rating !== undefined) {
    try { await interaction.reply({ content: '✅ You have already rated this ticket. Thank you.', flags: 64 }); } catch { /* expired */ }
    return;
  }

  ticket.rating = rating;
  ticket.ratedBy = interaction.user.id;
  await saveTicket(ticket);

  if (ticket.claimedBy) {
    const stats = getAdminStats(ticket.claimedBy);
    stats.totalRating = (stats.totalRating ?? 0) + rating;
    stats.ratingCount = (stats.ratingCount ?? 0) + 1;
    await saveAdminStats(stats);
  }

  const stars = '⭐'.repeat(rating);
  const confirmation = notice({
    title: '✅ Thank you for your rating',
    color: RATING_COLORS[rating] ?? C.ok,
    description: [
      `${RATING_EMOJI[rating] ?? '⭐'} **Your rating:** ${stars} (${rating}/5) — `
        + `**${RATING_LABELS[rating] ?? ''}**`,
      '',
      '> Your feedback is what we use to improve the service.',
    ].join('\n'),
    footer: 'Kratos System • Thank you for your trust',
    timestamp: true,
  });

  try {
    // Buttons are removed so the rating cannot be changed or repeated.
    await interaction.update({ embeds: [confirmation], components: [] });
  } catch {
    try {
      await interaction.reply({ embeds: [confirmation], flags: 64 });
    } catch { /* the interaction is already gone */ }
  }

  try {
    await sendOrUpdateTicketLog(client, ticket);
  } catch { /* the archive is best-effort */ }

  // A rating means the member is done, so the channels go now rather than
  // waiting out the 20-minute timer.
  if (closeTimers.has(ticket.ticketId)) clearTimeout(closeTimers.get(ticket.ticketId));
  await deleteChannels(client, ticket);
}