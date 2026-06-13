import { Events } from 'discord.js';
import { deleteGuildData } from '../database.js';
import Ticket from '../models/Ticket.js';
import TicketGuildConfig from '../models/TicketGuildConfig.js';
import VoiceChannel from '../models/VoiceChannel.js';
import GuildSetup from '../models/GuildSetup.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:10001';

export const name = Events.GuildDelete;
export const once = false;

export async function execute(guild) {
  const guildId = guild.id;

  await deleteGuildData(guildId);

  await Promise.all([
    Ticket.deleteMany({ guildId }),
    TicketGuildConfig.deleteOne({ guildId }),
    VoiceChannel.deleteMany({ guildId }),
    GuildSetup.deleteOne({ guildId }),
    // Also notify dashboard to clean its data
    fetch(`${DASHBOARD_URL}/api/webhooks/guild-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId, secret: process.env.BOT_TOKEN }),
    }).catch(() => {}),
  ]);

  console.log(`[GuildDelete] Cleaned data for ${guild.name} (${guildId})`);
}
