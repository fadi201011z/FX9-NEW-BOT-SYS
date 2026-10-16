/**
 * voiceIcons.js — the icon set behind the temporary-voice panel.
 *
 * The panel's buttons carry the bot's own artwork instead of ordinary Unicode
 * emoji, which is what makes it read as one designed surface rather than a row
 * of mismatched glyphs. Discord buttons cannot take an image directly, so the
 * PNGs are uploaded once as **application emojis** (emojis owned by the bot's
 * application, usable in its components in every guild) and referenced by id.
 *
 * Lifecycle
 * ---------
 * `ensureVoiceIcons(client)` runs once on ready, before any panel is built. It
 * reconciles what is already on the application with `ICON_FILES` and uploads
 * only what is missing, so a restart costs nothing and re-uploading never
 * happens. Results land in an in-memory map read by `ico()`.
 *
 * `ico(key)` returns the Discord emoji payload `{ id, name }`, or the Unicode
 * `fallback` when the upload did not succeed. The panel therefore degrades to
 * the plain glyphs it used before rather than losing its buttons entirely.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ICON_DIR = new URL('../../assets/vc-icons/', import.meta.url);

/**
 * button key -> { file, fallback }.
 *
 * The right-hand `fallback` is the Unicode glyph the button shows when the
 * custom emoji is unavailable, chosen to sit as close as possible to the
 * artwork it stands in for.
 */
export const ICON_FILES = Object.freeze({
  vc_lock:        { file: 'icon_10.png', fallback: '🔒' },
  vc_unlock:      { file: 'icon_11.png', fallback: '🔓' },
  vc_hide:        { file: 'icon_08.png', fallback: '🙈' },
  vc_show:        { file: 'icon_09.png', fallback: '👁️' },
  vc_info:        { file: 'icon_16.png', fallback: 'ℹ️' },
  vc_rename:      { file: 'icon_01.png', fallback: '✏️' },
  vc_limit:       { file: 'icon_06.png', fallback: '👥' },
  vc_bitrate:     { file: 'icon_17.png', fallback: '🎚️' },
  vc_region:      { file: 'icon_18.png', fallback: '🌍' },
  vc_clone:       { file: 'icon_05.png', fallback: '🧬' },
  vc_claim:       { file: 'icon_02.png', fallback: '🙋' },
  vc_transfer:    { file: 'icon_21.png', fallback: '🔑' },
  vc_invite:      { file: 'icon_20.png', fallback: '💌' },
  vc_permit:      { file: 'icon_12.png', fallback: '✅' },
  vc_reject:      { file: 'icon_13.png', fallback: '⛔' },
  vc_kick:        { file: 'icon_03.png', fallback: '👢' },
  vc_summon:      { file: 'icon_14.png', fallback: '📥' },
  vc_muteall:     { file: 'icon_15.png', fallback: '🔇' },
  vc_unmuteall:   { file: 'icon_19.png', fallback: '🔊' },
  vc_deafenall:   { file: 'icon_22.png', fallback: '🎧' },
  vc_undeafenall: { file: 'icon_07.png', fallback: '👂' },
  vc_reset:       { file: 'icon_04.png', fallback: '♻️' },
  vc_delete:      { file: 'icon_23.png', fallback: '🗑️' },
});

/** key -> ApplicationEmoji, filled by ensureVoiceIcons(). */
const uploaded = new Map();

/** key -> boolean, true once the key has been attempted this process. */
const attempted = new Set();

/**
 * Upload any of the panel icons the application does not already own.
 * Safe to call on every ready; only missing emojis are created.
 */
export async function ensureVoiceIcons(client) {
  const app = client.application;
  if (!app) return;

  let existing;
  try {
    existing = await app.emojis.fetch();
  } catch (err) {
    console.error('[VoiceIcons] Could not list application emojis:', err.message);
    return;
  }

  let created = 0;
  for (const [key, { file }] of Object.entries(ICON_FILES)) {
    attempted.add(key);

    // Reuse by name, so a restart adopts the emojis from the previous run.
    const found = existing.find((e) => e.name === key);
    if (found) {
      uploaded.set(key, found);
      continue;
    }

    try {
      const path = fileURLToPath(new URL(file, ICON_DIR));
      const emoji = await app.emojis.create({ attachment: readFileSync(path), name: key });
      uploaded.set(key, emoji);
      created++;
    } catch (err) {
      // A single failure must not stop the rest, and must not stop the panel:
      // the fallback glyph covers this button.
      console.error(`[VoiceIcons] Upload failed for ${key} (${file}):`, err.message);
    }
  }

  const ready = uploaded.size;
  console.log(
    `[VoiceIcons] ✅ ${ready}/${Object.keys(ICON_FILES).length} panel icon(s) ready` +
    (created ? ` (${created} uploaded this run)` : ' (all reused)'),
  );
}

/**
 * The Discord emoji payload for a panel button key.
 *
 * Returns the uploaded custom emoji `{ id, name }`, or the review fallback
 * glyph string when the artwork is not available — both are accepted by
 * `ButtonBuilder#setEmoji`.
 */
export function ico(key) {
  const emoji = uploaded.get(key);
  if (emoji) return { id: emoji.id, name: emoji.name };
  return ICON_FILES[key]?.fallback ?? '❔';
}

/** True once every panel icon is available as a custom application emoji. */
export function iconsReady() {
  return uploaded.size === Object.keys(ICON_FILES).length;
}
