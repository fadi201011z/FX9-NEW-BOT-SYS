/**
 * audit.js — جلب سجلات التدقيق (Audit Logs) مع تخفيف الضغط
 *
 * fetchAuditLogs مقيّد من قبل Discord (معدل محدود/دقيقة لكل سيرفر).
 * هذا الوسيط يخزّن آخر إدخال لكل (سيرفر + نوع) لفترة قصيرة،
 * فيُتجنَّب تكرار الطلب مع كل حدث — والنتيجة: سجلات أسرع بدون ضرب الحدود.
 */

const entryCache = new Map();
const TTL_MS = 2500;

export async function getAuditEntry(guild, type) {
  const key = `${guild.id}:${type}`;
  const now = Date.now();

  const hit = entryCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.entry;

  let entry = null;
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 1 });
    entry = logs.entries.first() ?? null;
  } catch {}

  entryCache.set(key, { at: now, entry });
  return entry;
}