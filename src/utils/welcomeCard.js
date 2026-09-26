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

// التصميم مكتمل — الشخصية داخل الإطار الدائري (مركزها ≈ 824,466 بمقاس 1664x864)
// نعرض الصورة كما هي دون أي رسم فوقها (لا avatar، لا إطار، لا تعتيم)
const DESIGN = { w: 1664, h: 864 };

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

  // 3) الرابط البعيد كخطة أخيرة فقط
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

export async function generateWelcomeCard() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const bgImg = await loadBg();

  if (bgImg) {
    // ملء الكارت بالتصميم كاملاً (نسبة 1672x940 ≈ 16:9 تكاد تطابق 1920x1080)
    const params = getCoverParams(bgImg, WIDTH, HEIGHT);
    ctx.drawImage(bgImg, params.ox, params.oy, params.sw, params.sh, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // التصميم مكتمل: لا نرسم فوقه أي عنصر — يظهر بالكامل وبجودة أصلية
  return canvas.toBuffer('image/png');
}