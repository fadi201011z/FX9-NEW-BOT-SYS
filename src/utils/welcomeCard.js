import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveGuildImage, fetchImageBuffer } from './guildImage.js';
import { getConfig } from '../database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const BG_CACHE = join(DATA_DIR, 'welcome_bg.png');
const BG_URL = 'https://i.ibb.co/pvYMQfxt/Gemini-Generated-Image-gimcq9gimcq9gimc-clean.png';
const WIDTH = 1920;
const HEIGHT = 1080;

let bgCache = null;

function coverFit(ctx, img, dw, dh) {
  const sx = img.width / dw;
  const sy = img.height / dh;
  if (sx > sy) {
    const sw = img.height * (dw / dh);
    ctx.drawImage(img, (img.width - sw) / 2, 0, sw, img.height, 0, 0, dw, dh);
  } else {
    const sh = img.width * (dh / dw);
    ctx.drawImage(img, 0, (img.height - sh) / 2, img.width, sh, 0, 0, dw, dh);
  }
}

function roundImage(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Image load timeout')), ms)),
  ]);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Numeric setting with a default — the dashboard stores every value as a string,
// so an empty/missing key or a non-numeric value must fall back cleanly.
function numCfg(guildId, key, fallback) {
  const raw = getConfig(guildId, key);
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function loadBg(guildId) {
  // Per-server welcome artwork set from the dashboard, with the bundled default
  // as the fallback.
  if (guildId) {
    const custom = resolveGuildImage(guildId, 'welcome_image');
    if (custom) {
      try {
        if (custom.buffer) return await loadImage(custom.buffer);
        const buf = await fetchImageBuffer(custom.url);
        return await loadImage(buf);
      } catch {}
    }
  }

  if (bgCache) return bgCache;

  if (existsSync(BG_CACHE)) {
    try {
      bgCache = await loadImage(readFileSync(BG_CACHE));
      return bgCache;
    } catch {}
  }

  try {
    const buf = await withTimeout(fetch(BG_URL).then(r => r.arrayBuffer()), 10000);
    const arr = new Uint8Array(buf);
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(BG_CACHE, arr);
    bgCache = await loadImage(arr);
    return bgCache;
  } catch {}

  return null;
}

export async function generateWelcomeCard(member, guildId) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const [bgImg, avatarImg] = await Promise.all([
    loadBg(guildId),
    withTimeout(loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 })), 10000),
  ]);

  if (bgImg) {
    coverFit(ctx, bgImg, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ─── Avatar placement (customisable from the dashboard) ────────────────────
  // The dashboard's welcome-image editor writes these keys; the defaults match
  // the original hard-coded layout so existing servers render unchanged.
  const cx = clamp(numCfg(guildId, 'welcome_avatar_x', 1340), 0, WIDTH);
  const cy = clamp(numCfg(guildId, 'welcome_avatar_y', 527), 0, HEIGHT);
  const size = clamp(numCfg(guildId, 'welcome_avatar_size', 512), 40, HEIGHT);
  const avatarR = size / 2;
  roundImage(ctx, avatarImg, cx, cy, avatarR);

  // Ring (inside the avatar edge, like the original white circle).
  const ringRaw = getConfig(guildId, 'welcome_avatar_ring');
  const ringOn = ringRaw === null ? true : ringRaw === '1';
  const ringWidth = clamp(numCfg(guildId, 'welcome_avatar_ring_width', 5), 0, size / 2);
  const ringColorRaw = getConfig(guildId, 'welcome_avatar_ring_color');
  const ringColor = /^#[0-9a-fA-F]{6}$/.test(ringColorRaw || '') ? ringColorRaw : '#ffffff';

  if (ringOn && ringWidth > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, avatarR - ringWidth / 2), 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringWidth;
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}
