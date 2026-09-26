import { getConfig } from '../database.js';

const DATA_URI_RE = /^data:image\/[^;,]+;base64,(.+)$/;

/**
 * قيمة صورة مخصصة لكل سيرفر من قاعدة البيانات (رابط أو base64 data URI).
 * @param {string} guildId
 * @param {string} key مفتاح الإعداد (welcome_image / ticket_panel_image / voice_panel_image)
 * @returns {string|null} القيمة الخام أو null
 */
export function getGuildImageValue(guildId, key) {
  const v = getConfig(guildId, key);
  return v && typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * تحويل base64 data URI إلى Buffer.
 * @param {string} dataUri
 * @returns {Buffer|null}
 */
export function dataUriToBuffer(dataUri) {
  const m = DATA_URI_RE.exec(dataUri);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

export function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

/**
 * يحل صورة السيرفر المخصصة إلى { buffer } أو { url } أو null.
 * @param {string} guildId
 * @param {string} key
 * @returns {{buffer: Buffer}|{url: string}|null}
 */
export function resolveGuildImage(guildId, key) {
  const val = getGuildImageValue(guildId, key);
  if (!val) return null;
  if (val.startsWith('data:image')) {
    const buf = dataUriToBuffer(val);
    if (buf) return { buffer: buf };
    return null;
  }
  if (isHttpUrl(val)) return { url: val };
  return null;
}

/**
 * جلب صورة HTTP إلى Buffer (مع مهلة).
 * @param {string} url
 * @param {number} timeoutMs
 */
export async function fetchImageBuffer(url, timeoutMs = 10000) {
  const res = await Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}