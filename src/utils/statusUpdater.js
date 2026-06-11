import { getConfig } from '../database.js';

/**
 * تحديث قنوات الإحصائيات الصوتية — يُستدعى كل دقيقة واحدة
 */
export async function updateStatusChannels(guild) {
  const totalId  = getConfig(guild.id, 'stats_total');
  const onlineId = getConfig(guild.id, 'stats_online');
  const botsId   = getConfig(guild.id, 'stats_bots');

  if (!totalId && !onlineId && !botsId) return;

  await guild.members.fetch().catch(() => {});
  const members = guild.members.cache;
  const total   = members.size;
  const bots    = members.filter(m => m.user.bot).size;
  const humans  = total - bots;

  let online = 0;
  try {
    online = members.filter(m =>
      !m.user.bot && m.presence && m.presence.status !== 'offline'
    ).size;
  } catch { /* presence intent غير مفعّل */ }

  const updates = [
    [totalId,  `👥 الأعضاء: ${humans}`],
    [onlineId, `🟢 متصل: ${online}`],
    [botsId,   `🤖 بوتات: ${bots}`],
  ];

  for (const [channelId, newName] of updates) {
    if (!channelId) continue;
    try {
      const ch = await guild.channels.fetch(channelId).catch(() => null);
      if (ch && ch.name !== newName) await ch.setName(newName).catch(() => {});
    } catch { /* القناة محذوفة */ }
  }
}
