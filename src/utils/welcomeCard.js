import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const BG_ASSET = join(__dirname, '..', '..', 'assets', 'welcome-bg.png');
const BG_CACHE = join(DATA_DIR, 'welcome_bg.png');
const BG_URL = 'https://i.ibb.co/pvYMQfxt/Gemini-Generated-Image-gimcq9gimcq9gimc-clean.png';
const WIDTH = 1920;
const HEIGHT = 1080;

// فتحة الصورة الدائرية داخل تصميم البنر
// مقاس التصميم المرجعي: 1664x864 — نحول الإحداثيات إلى نسب لإبقائها صحيحة على أي مقاس فعلي
const DESIGN = { w: 1664, h: 864 };
const SLOT_CF = 824 / DESIGN.w;   // ~0.4952 (مركز X نسبة أفقية)
const SLOT_RF = 466 / DESIGN.h;   // ~0.5394 (مركز Y نسبة رأسية)
const SLOT_DIAM = 275;            // قطر الصورة الدائرية (270–280)
const SLOT_RF_R = SLOT_DIAM / 2 / DESIGN.h; // نصف القطر نسبة رأسية (يحافظ على الدائرة)

let bgCache = null;

function getCoverParams(img, dw, dh) {
  const sx = img.width / dw;
  const sy = img.height / dh;
  if (sx > sy) {
    const sw = img.height * (dw / dh);
    return { sw, sh: img.height, ox: (img.width - sw) / 2, oy: 0, scale: dw / sw };
  }
  const sh = img.width * (dh / dw);
  return { sw: img.width, sh, ox: 0, oy: (img.height - sh) / 2, scale: dh / sh };
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

async function loadBg() {
  if (bgCache) return bgCache;

  // 1) الملف المحلي المرفوع مع البوت (assets/welcome-bg.png)
  if (existsSync(BG_ASSET)) {
    try {
      bgCache = await loadImage(readFileSync(BG_ASSET));
      return bgCache;
    } catch {}
  }

  // 2) كاش سابق في مجلد البيانات
  if (existsSync(BG_CACHE)) {
    try {
      bgCache = await loadImage(readFileSync(BG_CACHE));
      return bgCache;
    } catch {}
  }

  // 3) الرابط البعيد كخطة أخيرة
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

export async function generateWelcomeCard(member) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const [bgImg, avatarImg] = await Promise.all([
    loadBg(),
    withTimeout(loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 })), 10000),
  ]);

  if (bgImg) {
    const params = getCoverParams(bgImg, WIDTH, HEIGHT);
    ctx.drawImage(bgImg, params.ox, params.oy, params.sw, params.sh, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, 'rgba(0,0,0,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // تحويل مواقع الفتحة من نسب التصميم إلى إحداثيات الكارت بعد الـ coverFit
  let cx, cy, r;
  if (bgImg) {
    const params = getCoverParams(bgImg, WIDTH, HEIGHT);
    cx = (SLOT_CF * bgImg.width - params.ox) * params.scale;
    cy = (SLOT_RF * bgImg.height - params.oy) * params.scale;
    r = SLOT_RF_R * bgImg.height * params.scale;
  } else {
    cx = WIDTH * SLOT_CF; cy = HEIGHT * SLOT_RF; r = (SLOT_DIAM / 2) * (HEIGHT / DESIGN.h);
  }

  roundImage(ctx, avatarImg, cx, cy, r);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();

  return canvas.toBuffer('image/png');
}