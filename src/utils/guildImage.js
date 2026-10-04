import { getConfig } from '../database.js';

const DATA_URI_RE = /^data:image\/[^;,]+;base64,(.+)$/;

/**
 * The per-server custom image, stored as either an https URL or a base64
 * data URI.
 *
 * @param {string} guildId
 * @param {string} key setting key — welcome_image / ticket_panel_image / voice_panel_image
 * @returns {string|null} the raw value, or null when unset
 */
export function getGuildImageValue(guildId, key) {
  const value = getConfig(guildId, key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Converts a base64 data URI into a Buffer.
 * @param {string} dataUri
 * @returns {Buffer|null}
 */
export function dataUriToBuffer(dataUri) {
  const match = DATA_URI_RE.exec(dataUri);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64');
  } catch {
    return null;
  }
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

/**
 * Resolves a server's custom image to a shape Discord accepts.
 * @param {string} guildId
 * @param {string} key
 * @returns {{buffer: Buffer}|{url: string}|null}
 */
export function resolveGuildImage(guildId, key) {
  const value = getGuildImageValue(guildId, key);
  if (!value) return null;

  if (value.startsWith('data:image')) {
    const buffer = dataUriToBuffer(value);
    return buffer ? { buffer } : null;
  }

  return isHttpUrl(value) ? { url: value } : null;
}

/**
 * Downloads an image into a Buffer, with a timeout so a dead host cannot hang
 * the caller.
 *
 * @param {string} url
 * @param {number} [timeoutMs=10000]
 */
export async function fetchImageBuffer(url, timeoutMs = 10_000) {
  let timer;
  try {
    const res = await Promise.race([
      fetch(url),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}