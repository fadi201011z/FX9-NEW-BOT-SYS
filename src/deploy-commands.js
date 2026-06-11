/**
 * تشغيل هذا الملف مرة واحدة لتسجيل جميع الأوامر في Discord:
 *   npm run deploy          ← سيرفر واحد
 *   npm run deploy:global   ← عام
 */

import { REST, Routes } from 'discord.js';
import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commands  = [];

const commandDirs = [
  path.join(__dirname, 'commands', 'setup'),
  path.join(__dirname, 'commands', 'moderation'),
  path.join(__dirname, 'commands', 'info'),
  path.join(__dirname, 'commands', 'members'),
  path.join(__dirname, 'commands', 'ticket'),
  path.join(__dirname, 'commands', 'voice'),
];

for (const dir of commandDirs) {
  let files;
  try { files = (await readdir(dir)).filter(f => f.endsWith('.js') || f.endsWith('.ts')); }
  catch { continue; }
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    if (mod.data) commands.push(mod.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

try {
  console.log(`📡 جاري تسجيل ${commands.length} أمر...`);

  const isGlobal = process.argv.includes('global');
  if (isGlobal) {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`✅ تم تسجيل ${commands.length} أمر بشكل عام`);
  } else {
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
      console.log(`✅ تم تسجيل ${commands.length} أمر في السيرفر ${guildId}`);
    } else {
      console.warn('⚠️ GUILD_ID غير مضبوط في .env — سجّل عاماً');
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log(`✅ تم تسجيل ${commands.length} أمر بشكل عام`);
    }
  }
} catch (error) {
  console.error('❌ فشل التسجيل:', error);
  process.exit(1);
}
