import { Events, REST, Routes } from 'discord.js';
import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

export const name = Events.GuildCreate;
export const once = false;

export async function execute(guild, client) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const commandDirs = [
    path.join(__dirname, '..', 'commands', 'setup'),
    path.join(__dirname, '..', 'commands', 'moderation'),
    path.join(__dirname, '..', 'commands', 'info'),
    path.join(__dirname, '..', 'commands', 'members'),
    path.join(__dirname, '..', 'commands', 'ticket'),
    path.join(__dirname, '..', 'commands', 'voice'),
  ];
  const cmdData = [];
  for (const dir of commandDirs) {
    let files;
    try { files = (await readdir(dir)).filter(f => f.endsWith('.js') || f.endsWith('.ts')); }
    catch { continue; }
    for (const file of files) {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      if (mod?.data) cmdData.push(mod.data.toJSON());
    }
  }
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
