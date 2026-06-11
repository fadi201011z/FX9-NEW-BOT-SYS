import { ActivityType } from 'discord.js';

let currentIndex = 0;

function buildStatuses(client) {
  const totalGuilds   = client.guilds.cache.size;
  const totalMembers  = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const totalCommands = client.commands?.size ?? 0;

  return [
    // المجموعة الأولى
    { name: `🛡️ يحمي ${totalGuilds} سيرفر`,        type: ActivityType.Watching,  status: 'online' },
    { name: `👥 ${totalMembers} عضو`,                 type: ActivityType.Watching,  status: 'online' },
    { name: `⚡ ${totalCommands} أمر جاهز`,           type: ActivityType.Playing,   status: 'online' },
    // المجموعة الثانية (تمت إزالة الأقواس المربعة الزائدة هنا)
    { name: '🔴 FX9-SYS | System Core',           type: ActivityType.Watching,  status: 'online' },
    { name: '🛡️ Protocol: Red-Shield Active',     type: ActivityType.Playing,   status: 'dnd'    },
    { name: '📡 Surveillance: Deep Scan',         type: ActivityType.Watching,  status: 'online' },
    { name: '⚡ Optimization: 100%',               type: ActivityType.Listening, status: 'online' },
    { name: '🛠️ Commands: /help & /setup',        type: ActivityType.Listening, status: 'online' },
    { name: '🔐 Database: Encrypted & Secure',     type: ActivityType.Watching,  status: 'dnd'    },
    { name: '⚔️ Mode: Guardian Overlord',           type: ActivityType.Playing,   status: 'online' }
  ];
}

function rotatePresence(client) {
  const statuses = buildStatuses(client);
  const entry    = statuses[currentIndex % statuses.length];

  // تأمين إضافي: التأكد من أن entry موجود وله اسم
  if (entry && entry.name) {
    client.user.setPresence({
      activities: [{ name: String(entry.name), type: entry.type }],
      status: entry.status,
    });
  }
  
  currentIndex++;
}

export function startPresenceRotation(client) {
  rotatePresence(client);
  setInterval(() => rotatePresence(client), 30_000);
}
