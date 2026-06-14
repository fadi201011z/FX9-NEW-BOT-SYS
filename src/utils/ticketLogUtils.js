import { buildTicketLogEmbed, ticketLogMenu } from "./embeds.js";
import { getGuildConfig, saveTicket } from "../data/ticketDB.js";

export async function sendOrUpdateTicketLog(client, ticket) {
  const config = getGuildConfig(ticket.guildId);
  if (!config?.logChannelId) return;

  const logCh = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!logCh) return;

  const embed = buildTicketLogEmbed(ticket);
  const row = ticketLogMenu(ticket);

  if (ticket.logMessageId) {
    try {
      const msg = await logCh.messages.fetch(ticket.logMessageId);
      await msg.edit({ embeds: [embed], components: [row] });
      return;
    } catch {
      // message was deleted — send a new one
    }
  }

  try {
    const msg = await logCh.send({ embeds: [embed], components: [row] });
    ticket.logMessageId = msg.id;
    await saveTicket(ticket);
  } catch (err) {
    console.error("[ticketLog] send failed:", err.message);
  }
}
