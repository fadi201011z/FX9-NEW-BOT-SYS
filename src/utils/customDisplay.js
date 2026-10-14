/**
 * customDisplay.js — per-guild "صورة / امبد" switch for the three custom
 * surfaces: the welcome message, the ticket panel and the temporary-voice panel.
 *
 * For every surface the dashboard can store:
 *
 *   <mode key>  'image' (default, absent) | 'embed'
 *   <embed key> a JSON string describing an embed, only used in 'embed' mode
 *
 * This module is the single reader of that state on the bot side, so the three
 * call sites (guildMemberAdd, panelPayload, buildStatusPanel) stay in sync. The
 * embed is clamped to Discord's own limits here as a second line of defence —
 * the dashboard already validates — so a hand-edited database row can never
 * make a send fail.
 */

import { EmbedBuilder } from 'discord.js';
import { getConfig } from '../database.js';

const ITEMS = {
  welcome: { mode: 'welcome_display', embed: 'welcome_embed' },
  ticket: { mode: 'ticket_display', embed: 'ticket_embed' },
  voice: { mode: 'voice_display', embed: 'voice_embed' },
};

/** 'image' unless the guild explicitly switched this surface to an embed. */
export function getDisplayMode(guildId, type) {
  const item = ITEMS[type];
  if (!item || !guildId) return 'image';
  return getConfig(guildId, item.mode) === 'embed' ? 'embed' : 'image';
}

/** Parsed embed definition for a surface, or null when none/!JSON. */
export function getEmbedConfig(guildId, type) {
  const item = ITEMS[type];
  if (!item || !guildId) return null;
  const raw = getConfig(guildId, item.embed);
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const trim = (value, max) => {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return max && text.length > max ? text.slice(0, max) : text;
};

const safeUrl = (value) => {
  const text = trim(value, 2048);
  return /^https?:\/\//i.test(text) ? text : '';
};

/**
 * Replaces {user} {mention} {tag} {server} {count} with live values. Unknown
 * placeholders are left untouched so a typo shows up instead of vanishing.
 */
function fill(text, vars) {
  if (!text || !vars) return text;
  return text.replace(/\{(user|mention|tag|server|count)\}/gi, (match, name) => {
    const value = vars[name.toLowerCase()];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * Builds the embed for a surface, or null when it is empty/invalid (callers
 * then fall back to the image behaviour rather than sending nothing).
 *
 * @param {string} guildId
 * @param {'welcome'|'ticket'|'voice'} type
 * @param {Record<string, unknown>} [vars] placeholder values, e.g. { user, count }
 */
export function buildCustomEmbed(guildId, type, vars) {
  const cfg = getEmbedConfig(guildId, type);
  if (!cfg) return null;

  const text = (value, max) => fill(trim(value, max), vars);
  const embed = new EmbedBuilder();

  const color = trim(cfg.color, 9);
  if (/^#[0-9a-f]{6}$/i.test(color)) embed.setColor(color);

  const authorName = text(cfg.authorName, 256);
  if (authorName) embed.setAuthor({ name: authorName, iconURL: safeUrl(cfg.authorIcon) || undefined });

  const title = text(cfg.title, 256);
  if (title) embed.setTitle(title);

  const description = text(cfg.description, 4096);
  if (description) embed.setDescription(description);

  if (Array.isArray(cfg.fields) && cfg.fields.length) {
    const fields = cfg.fields.slice(0, 25).map((field) => ({
      name: text(field?.name, 256) || '\u200b',
      value: text(field?.value, 1024) || '\u200b',
      inline: !!field?.inline,
    }));
    if (fields.length) embed.addFields(fields);
  }

  const image = safeUrl(cfg.image);
  if (image) embed.setImage(image);

  const thumbnail = safeUrl(cfg.thumbnail);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const footerText = text(cfg.footerText, 2048);
  if (footerText) embed.setFooter({ text: footerText, iconURL: safeUrl(cfg.footerIcon) || undefined });

  if (cfg.timestamp) embed.setTimestamp();

  const data = embed.data || {};
  const hasBody = data.title || data.description || data.author || data.footer
    || data.image || data.thumbnail || (data.fields && data.fields.length);
  return hasBody ? embed : null;
}
