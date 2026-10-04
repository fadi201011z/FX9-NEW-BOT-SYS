import { Events, REST, Routes } from 'discord.js';
import { commandPayloads } from '../config/commandLoader.js';

export const name = Events.GuildCreate;
export const once = false;

export async function execute(guild, client) {
  const cmdData = await commandPayloads();
  if (cmdData.length > 0) {
    try {
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: cmdData });
      console.log(`[GuildCreate] ✅ ${cmdData.length} commands registered in ${guild.name} (${guild.id})`);
    } catch (err) {
      console.error(`[GuildCreate] ❌ Failed to register commands in ${guild.id}:`, err.message);
    }
  }
}
