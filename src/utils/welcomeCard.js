import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BG_ASSET = join(__dirname, '..', '..', 'assets', 'welcome-bg.png');
const WIDTH = 1920;
const HEIGHT = 1080;

// فتحة صورة العضو داخل تصميم البنر (مركز الدائرة)
// مقاس التصميم المرجعي: 1664x864 — نسب تُبقي الموضع صحيحاً على أي مقاس فعلي
const DESIGN = { w: 1664, h: 864 };
const SLOT_CF = 824 / DESIGN.w;          // ~0.4952 (مركز X)
const SLOT_RF = 466 / DESIGN.h;          // ~0.5394 (مركز Y)
const SLOT_DIAM = 275;                   // قطر الفتحة (270–280)
const SLOT_RF_R = SLOT_DIAM / 2 / DESIGN.h; // نصف القطر نسبة رأسية (يحافظ على الدائرة)

let bgCache = null;

const FALLBACK_COLOR = '#171a2b';

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

// تحميل الخلفية: من الملف المحلي المرفوع مع البوت فقط
// (لا كاش قديم، لا رابط بعيد — يستحيل ظهور الصورة القديمة إطلاقاً)
async function loadBg() {
  if (bgCache) return bgCache;
  if (existsSync(BG_ASSET)) {
    try {
      bgCache = await loadImage(readFileSync(BG_ASSET));
      return bgCache;
    } catch {}
  }
  return null;
}

/**
 * توليد بطاقة الترحيب.
 * @param {object} member كائن العضو (يُستخدم لصورة العضو فقط)
 * @param {object} opts { drawAvatar: true } — رسم صورة العضو داخل الفتحة الدائرية
 */
export async function generateWelcomeCard(member, opts = {}) {
  const { drawAvatar = true } = opts;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  const bgImg = await loadBg();

  let params = null;
  if (bgImg) {
    params = getCoverParams(bgImg, WIDTH, HEIGHT);
    ctx.drawImage(bgImg, params.ox, params.oy, params.sw, params.sh, 0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = FALLBACK_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  if (drawAvatar) {
    // تحويل مركز الفتحة من نسب التصميم إلى إحداثيات الكارت بعد الـ coverFit
    let cx, cy, r;
    if (params) {
      cx = (SLOT_CF * bgImg.width - params.ox) * params.scale;
      cy = (SLOT_RF * bgImg.height - params.oy) * params.scale;
      r = SLOT_RF_R * bgImg.height * params.scale;
    } else {
      cx = WIDTH * SLOT_CF;
      cy = HEIGHT * SLOT_RF;
      r = (SLOT_DIAM / 2) * (HEIGHT / DESIGN.h);
    }

    let avatarImg = null;
    try {
      avatarImg = await withTimeout(
        loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 })),
        10000
      );
    } catch {}
    if (avatarImg) {
      // خلفية واقية خفيفة خلف الفتحة لثبات الألوان فوق أي تصميم
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();

      roundImage(ctx, avatarImg, cx, cy, r);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  return canvas.toBuffer('image/png');
}