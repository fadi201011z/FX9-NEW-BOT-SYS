import { ActivityType } from 'discord.js';
import { commandModules } from '../config/commandLoader.js';

let currentIndex = 0;
let rotationInterval = null;
let isMaintenance = false;

/**
 * Built fresh on each rotation rather than cached, so the guild, member and
 * command counts never drift from reality.
 */
async function buildStatuses(client) {
  const guilds  = client.guilds.cache.size;
  const members = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
  const commands = (await commandModules())
    .filter((m) => typeof m.mod.execute === 'function').length;

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return [
    { name: `🛡️ Protecting ${plural(guilds, 'server')}`, type: ActivityType.Watching, status: 'online' },
    { name: `👥 ${plural(members, 'member')}`, type: ActivityType.Watching, status: 'online' },
    { name: `⚙️ ${plural(commands, 'command')} ready`, type: ActivityType.Playing, status: 'online' },
    { name: '⚔️ Kratos System — moderation, tickets and voice', type: ActivityType.Watching, status: 'online' },
    { name: '🛡️ Protection: active', type: ActivityType.Playing, status: 'online' },
    { name: '🔧 Automation: logging every action', type: ActivityType.Watching, status: 'online' },
    { name: '⚡ Uptime: 100%', type: ActivityType.Listening, status: 'online' },
    { name: '🛠️ Start here: /help or /setup', type: ActivityType.Listening, status: 'online' },
    { name: '📋 Every moderation action is logged', type: ActivityType.Watching, status: 'online' },
    { name: '🎫 Support tickets, rated by members', type: ActivityType.Playing, status: 'online' },
  ];
}

function setPresence(client, entry) {
  if (!entry?.name) return;
  client.user.setPresence({
    activities: [{ name: String(entry.name), type: entry.type }],
    status: entry.status,
  });
}

async function rotatePresence(client) {
  if (isMaintenance) return;
  const statuses = await buildStatuses(client);
  setPresence(client, statuses[currentIndex % statuses.length]);
  currentIndex++;
}

export function startPresenceRotation(client) {
  rotatePresence(client);
  rotationInterval = setInterval(() => rotatePresence(client), 30_000);
}

export function setMaintenancePresence(client, message) {
  isMaintenance = true;
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
  }
  setPresence(client, {
    name: `🔧 ${message || 'Under maintenance — back shortly'}`,
    type: ActivityType.Playing,
    status: 'dnd',
  });
}

export function clearMaintenancePresence(client) {
  isMaintenance = false;
  currentIndex = 0;
  startPresenceRotation(client);
}