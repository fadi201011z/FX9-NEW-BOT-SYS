/**
 * deploy-commands.js
 *
 * Run once to push the slash command list to Discord:
 *   npm run deploy          → single guild (uses GUILD_ID from .env)
 *   npm run deploy:global   → global
 *
 * Folders are discovered by the shared loader, so this can never drift out of
 * sync with the runtime handler loader. Only commands that actually export an
 * `execute` are sent — registering a command the bot cannot run would give the
 * user a picker entry that answers nothing.
 */

import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { commandPayloads, findUndispatchable, commandModules } from './config/commandLoader.js';

const commands = await commandPayloads();

const undispatchable = findUndispatchable(await commandModules());
if (undispatchable.length > 0) {
  console.warn(
    `⚠️  ${undispatchable.length} module(s) export command data but no execute() — skipped: ` +
    undispatchable.map(({ name, folder }) => `/${name} (${folder})`).join(', ')
  );
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

try {
  console.log(`📡 Registering ${commands.length} commands…`);

  const isGlobal = process.argv.includes('global');
  if (isGlobal) {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`✅ Registered ${commands.length} commands globally.`);
  } else {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
      console.log(`✅ Registered ${commands.length} commands in guild ${guildId}.`);
    } else {
      console.warn('⚠️  GUILD_ID is not set in .env — registering globally instead.');
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log(`✅ Registered ${commands.length} commands globally.`);
    }
  }
} catch (error) {
  console.error('❌ Registration failed:', error);
  process.exit(1);
}