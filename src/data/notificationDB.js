import Notification from '../models/Notification.js';

const subscriptions = new Map();

export function getSubscriptions(guildId) {
  const all = [];
  for (const sub of subscriptions.values()) {
    if (sub.guildId === guildId) all.push(sub);
  }
  return all;
}

export function getSubscription(id) {
  return subscriptions.get(id) ?? null;
}

export function getAllSubscriptions() {
  return Array.from(subscriptions.values());
}

export async function addSubscription(data) {
  const filter = { guildId: data.guildId, platform: data.platform, channelUrl: data.channelUrl };
  const update = {
    $set: {
      channelId: data.channelId || '',
      channelName: data.channelName || '',
      discordChannelId: data.discordChannelId,
      customMessage: data.customMessage || '',
      lastVideoId: data.lastVideoId || '',
      lastStreamStatus: false,
      lastStreamId: '',
    },
    $setOnInsert: { createdAt: Date.now() },
  };
  const doc = await Notification.findOneAndUpdate(filter, update, { upsert: true, new: true });
  subscriptions.set(doc._id.toString(), doc);
  return doc;
}

export async function removeSubscription(id) {
  subscriptions.delete(id);
  await Notification.deleteOne({ _id: id }).catch(() => {});
}

export async function updateSubscription(id, updates) {
  const sub = subscriptions.get(id);
  if (!sub) return null;
  Object.assign(sub, updates);
  await Notification.findOneAndUpdate({ _id: id }, sub, { new: true }).catch(() => {});
  return sub;
}

export async function loadAllSubscriptions() {
  const rows = await Notification.find({}).lean();
  subscriptions.clear();
  // Deduplicate: keep the newest doc per guild+platform+channelUrl
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.guildId}|${row.platform}|${row.channelUrl}`;
    const existing = seen.get(key);
    if (!existing || (row.createdAt || 0) > (existing.createdAt || 0)) {
      seen.set(key, row);
    }
  }
  for (const row of seen.values()) {
    subscriptions.set(row._id.toString(), row);
  }
  const removed = rows.length - seen.size;
  if (removed > 0) console.log(`[NotifDB] Removed ${removed} duplicates, loaded ${seen.size} subscriptions`);
  else console.log(`[NotifDB] Loaded ${rows.length} subscriptions`);
  return seen.size;
}
