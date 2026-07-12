import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = join(__dirname, '..', '..', 'fonts', 'NotoSansArabic-Regular.ttf');
const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf';
const BG_URL = 'https://j.top4top.io/p_3845prskm1.png';
const WIDTH = 800;
const HEIGHT = 400;
const FONT = 'Noto Sans Arabic';

let fontPromise = null;

async function initFont() {
  try {
    const dir = join(__dirname, '..', '..', 'fonts');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(FONT_PATH)) {
      console.log('[WelcomeFont] تحميل الخط العربي...');
      const res = await fetch(FONT_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(FONT_PATH, buf);
      console.log('[WelcomeFont] تم تحميل الخط');
    }
    GlobalFonts.registerFromPath(FONT_PATH, FONT);
    console.log(`[WelcomeFont] الخط "${FONT}" جاهز`);
  } catch (err) {
    console.error('[WelcomeFont] فشل تحميل الخط:', err.message);
  }
}

fontPromise = initFont();

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

export async function generateWelcomeCard(member, guild, isNewAccount = false) {
  await fontPromise;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const [bgImg, avatarImg] = await Promise.all([
    loadImage(BG_URL),
    loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 })),
  ]);

  coverFit(ctx, bgImg, WIDTH, HEIGHT);

  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ax = WIDTH - 120, ay = 200, r = 70;
  roundImage(ctx, avatarImg, ax, ay, r);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText('👋 مرحباً بك', WIDTH - 190, 140);

  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = '#fbbf24';
  const name = member.user.username.length > 16 ? member.user.username.slice(0, 13) + '...' : member.user.username;
  ctx.fillText(name, WIDTH - 190, 178);

  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`أنت العضو رقم #${guild.memberCount}`, WIDTH - 190, 220);

  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(guild.name, WIDTH - 190, 248);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 275);
  ctx.lineTo(WIDTH - 190, 275);
  ctx.stroke();

  if (isNewAccount) {
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('⚠️ هذا الحساب عمره أقل من 7 أيام', WIDTH - 190, 285);
  }

  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const d = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(`FX9 • ${d}`, 20, HEIGHT - 12);

  return canvas.toBuffer('image/png');
}
