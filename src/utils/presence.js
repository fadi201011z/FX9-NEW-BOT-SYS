import { ActivityType } from 'discord.js';

let currentIndex = 0;
let rotationInterval = null;
let isMaintenance = false;

function buildStatuses(client) {
  const totalGuilds   = client.guilds.cache.size;
  const totalMembers  = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const totalCommands = client.commands?.size ?? 0;
  return [
    { name: `🛡️ يحمي ${totalGuilds} سيرفر`,        type: ActivityType.Watching,  status: 'online' },
    { name: `👥 ${totalMembers} عضو`,                 type: ActivityType.Watching,  status: 'online' },
    { name: `⚡ ${totalCommands} أمر جاهز`,           type: ActivityType.Playing,   status: 'online' },
    { name: '🔴 FX9-SYS | System Core',           type: ActivityType.Watching,  status: 'online' },
    { name: '🛡️ Protocol: Red-Shield Active',     type: ActivityType.Playing,   status: 'dnd'    },
    { name: '📡 Surveillance: Deep Scan',         type: ActivityType.Watching,  status: 'online' },
    { name: '⚡ Optimization: 100%',               type: ActivityType.Listening, status: 'online' },
    { name: '🛠️ Commands: /help & /setup',        type: ActivityType.Listening, status: 'online' },
    { name: '🔐 Database: Encrypted & Secure',     type: ActivityType.Watching,  status: 'dnd'    },
    { name: '⚔️ Mode: Guardian Overlord',           type: ActivityType.Playing,   status: 'online' }
  ];
}

function setPresence(client, entry) {
  if (entry && entry.name) {
    client.user.setPresence({
      activities: [{ name: String(entry.name), type: entry.type }],
      status: entry.status,
    });
  }
}

function rotatePresence(client) {
  if (isMaintenance) return;
  const statuses = buildStatuses(client);
  const entry = statuses[currentIndex % statuses.length];
  setPresence(client, entry);
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
    name: `🔧 ${message || 'البوت تحت الصيانة'}`,
    type: ActivityType.Playing,
    status: 'idle',
  });
}

export function clearMaintenancePresence(client) {
  isMaintenance = false;
  currentIndex = 0;
  startPresenceRotation(client);
}
