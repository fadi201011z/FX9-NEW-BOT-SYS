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
  for (const row of rows) {
    subscriptions.set(row._id.toString(), row);
  }
  console.log(`[NotifDB] Loaded ${rows.length} subscriptions`);
  return rows.length;
}
