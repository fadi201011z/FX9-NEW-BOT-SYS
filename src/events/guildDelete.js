import { Events } from 'discord.js';
import { deleteGuildData } from '../database.js';
import Ticket from '../models/Ticket.js';
import TicketGuildConfig from '../models/TicketGuildConfig.js';
import VoiceChannel from '../models/VoiceChannel.js';
import GuildSetup from '../models/GuildSetup.js';

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
  ]);

  console.log(`[GuildDelete] Cleaned data for ${guild.name} (${guildId})`);
}
