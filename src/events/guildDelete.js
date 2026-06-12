import { Events } from 'discord.js';
import { deleteGuildData } from '../database.js';
import { loadData, saveData } from '../data/ticketDB.js';
import { loadActiveChannels } from '../handlers/db.js';
import fs from 'fs';
import path from 'path';

export const name = Events.GuildDelete;
export const once = false;

export async function execute(guild) {
  const guildId = guild.id;

  deleteGuildData(guildId);

  const tickets = loadData();
  if (tickets.guilds?.[guildId]) {
    delete tickets.guilds[guildId];
  }
  if (tickets.tickets) {
    for (const [id, t] of Object.entries(tickets.tickets)) {
      if (t.guildId === guildId) delete tickets.tickets[id];
    }
  }
  saveData(tickets);

  const active = loadActiveChannels();
  if (active) {
    for (const [id, vc] of Object.entries(active)) {
      if (vc.guildId === guildId) delete active[id];
    }
    const ACTIVE_FILE = path.join(process.cwd(), 'data', 'active_channels.json');
    try { fs.writeFileSync(ACTIVE_FILE, JSON.stringify(active, null, 2), 'utf8'); } catch {}
  }

  console.log(`[GuildDelete] Cleaned data for ${guild.name} (${guildId})`);
}
