import { getAllOpenTickets, getTicket, saveTicket } from '../data/ticketDB.js';
import { logEntry, inactivityEmbed, ratingEmbed, ratingButtons, field } from '../utils/embeds.js';
import { sendOrUpdateTicketLog } from '../utils/ticketLogUtils.js';
import { isEnabled } from '../utils/features.js';

const WARN_MS  = 24 * 60 * 60 * 1000;
const CLOSE_MS = 36 * 60 * 60 * 1000;

/** How long the channels stay up after an auto-close, per delivery path. */
const DELETE_DELAY = { rated: 8_000, unrated: 30_000 };

export function startInactivityMonitor(client) {
  setInterval(() => checkAll(client), 30 * 60 * 1000);
  console.log('  ⏰  Inactivity monitor active (checked every 30 minutes)');
}

export async function updateTicketActivity(channelId) {
  const t = getTicket(channelId);
  if (t && t.status !== 'closed') {
    t.lastActivity     = Date.now();
    t.inactivityWarned = false;
    await saveTicket(t);
  }
}

async function checkAll(client) {
  // The inactivity auto-close belongs to the ticket system.
  if (!isEnabled('tickets')) return;
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    for (const ticket of getAllOpenTickets(guild.id)) {
      const elapsed = now - ticket.lastActivity;
      if (elapsed >= CLOSE_MS) await autoClose(client, ticket);
      else if (elapsed >= WARN_MS && !ticket.inactivityWarned) await warn(client, ticket);
    }
  }
}

async function warn(client, ticket) {
  try {
    const ch = client.channels.cache.get(ticket.channelId);
    if (!ch) return;

    ticket.inactivityWarned = true;
    await saveTicket(ticket);

    await ch.send({
      content: `<@${ticket.userId}>`,
      embeds: [inactivityEmbed(ticket.ticketId)],
    });

    if (ticket.adminChannelId) {
      const adminCh = client.channels.cache.get(ticket.adminChannelId);
      await adminCh?.send({ embeds: [inactivityEmbed(ticket.ticketId)] });
    }
  } catch { /* the channel may already be gone */ }
}

async function autoClose(client, ticket) {
  try {
    ticket.status   = 'closed';
    ticket.closedAt = Date.now();
    await saveTicket(ticket);

    const embed = logEntry({
      kind: 'ticket_autoclose',
      target: `<@${ticket.userId}>`,
      reason: 'No activity for 36 hours',
      fields: [field('Ticket', ticket.ticketId)],
    });

    const ratingData = {
      embeds:     [ratingEmbed(ticket.ticketId, ticket.claimedByUsername)],
      components: [ratingButtons(ticket.ticketId)],
    };

    // Prefer the DM so the rating stays private; fall back to the channel.
    let ratingInChannel = false;
    try {
      const user = await client.users.fetch(ticket.userId);
      await user.send(ratingData);
    } catch {
      ratingInChannel = true;
    }

    const userCh = client.channels.cache.get(ticket.channelId);
    if (userCh) {
      await userCh.send({ embeds: [embed] });
      if (ratingInChannel) {
        await userCh.send({
          content: `<@${ticket.userId}> ⭐ **Rate your experience** using the buttons below — `
            + 'this channel deletes itself in **30 seconds**.',
          ...ratingData,
        });
      }
    }

    if (ticket.adminChannelId) {
      const adminCh = client.channels.cache.get(ticket.adminChannelId);
      await adminCh?.send({ embeds: [embed] });
    }

    await sendOrUpdateTicketLog(client, ticket);

    const delay = ratingInChannel ? DELETE_DELAY.unrated : DELETE_DELAY.rated;
    setTimeout(async () => {
      await userCh?.delete().catch(() => null);
      if (ticket.adminChannelId) {
        const adminCh = client.channels.cache.get(ticket.adminChannelId);
        await adminCh?.delete().catch(() => null);
      }
    }, delay);
  } catch (err) {
    console.error('[Inactivity AutoClose]', err);
  }
}