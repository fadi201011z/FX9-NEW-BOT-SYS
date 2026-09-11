import Notification from '../models/Notification.js';

const subscriptions = new Map();
let legacyMigrated = false;

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
  try {
    const doc = await Notification.findOneAndUpdate({ _id: id }, { $set: updates }, { new: true }).lean();
    if (doc) {
      const cached = subscriptions.get(id);
      if (cached) Object.assign(cached, updates);
    }
    return doc;
  } catch {
    return null;
  }
}

export async function loadAllSubscriptions() {
  await migrateLegacyCollection();
  const rows = await Notification.find({}).lean();
  const seen = new Map();
  for (const row of rows) {
    const key = `${row.guildId}|${row.platform}|${row.channelUrl}`;
    const existing = seen.get(key);
    if (!existing || (row.createdAt || 0) > (existing.createdAt || 0)) {
      seen.set(key, row);
    }
  }
  const validIds = new Set();
  for (const row of seen.values()) {
    const id = row._id.toString();
    validIds.add(id);
    if (subscriptions.has(id)) {
      Object.assign(subscriptions.get(id), row);
    } else {
      subscriptions.set(id, row);
    }
  }
  for (const [id] of subscriptions) {
    if (!validIds.has(id)) subscriptions.delete(id);
  }
  const removed = rows.length - seen.size;
  if (removed > 0) console.log(`[NotifDB] Removed ${removed} duplicates, loaded ${seen.size} subscriptions`);
  else console.log(`[NotifDB] Loaded ${rows.length} subscriptions`);
  return seen.size;
}

// One-time migration: older dashboard model wrote to the 'Notifications' collection.
// Copy any legacy docs into the unified 'notifications' collection (skip existing).
async function migrateLegacyCollection() {
  if (legacyMigrated) return;
  legacyMigrated = true;
  try {
    const db = Notification.db.connection?.db;
    if (!db) return;
    const has = await db.listCollections({ name: 'Notifications' }, { nameOnly: true }).hasNext();
    if (!has) return;
    const oldDocs = await db.collection('Notifications').find({}).toArray();
    let migrated = 0;
    for (const d of oldDocs) {
      const { _id, ...rest } = d;
      if (!rest.guildId || !rest.platform || !rest.channelUrl) continue;
      const res = await db.collection('notifications').updateOne(
        { guildId: rest.guildId, platform: rest.platform, channelUrl: rest.channelUrl },
        { $setOnInsert: { ...rest } },
        { upsert: true },
      );
      if (res.upsertedCount > 0) migrated++;
    }
    if (migrated > 0) console.log(`[NotifDB] Migrated ${migrated} subscriptions from legacy 'Notifications' collection`);
  } catch (e) {
    console.error('[NotifDB] Legacy migration error:', e.message);
  }
}
