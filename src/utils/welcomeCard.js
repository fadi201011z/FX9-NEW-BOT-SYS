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

let fontReady = false;

async function ensureFont() {
  if (fontReady) return;
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
    fontReady = true;
    console.log(`[WelcomeFont] الخط "${FONT}" جاهز`);
  } catch (err) {
    console.error('[WelcomeFont] فشل تحميل الخط:', err.message);
  }
}

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

  const ax = 80, ay = 200, r = 70;
  roundImage(ctx, avatarImg, ax, ay, r);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.stroke();

  const fontSize = 28;
  const fn = fontReady ? FONT : 'sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px ${fn}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('👋 مرحباً بك', 180, 145);

  ctx.font = `bold 24px ${fn}`;
  ctx.fillStyle = '#fbbf24';
  const name = member.user.username.length > 18 ? member.user.username.slice(0, 15) + '...' : member.user.username;
  ctx.fillText(name, 180, 178);

  ctx.font = `16px ${fn}`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`أنت العضو رقم #${guild.memberCount}`, 180, 218);

  ctx.font = `13px ${fn}`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(guild.name, 180, 245);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, 270);
  ctx.lineTo(WIDTH - 40, 270);
  ctx.stroke();

  if (isNewAccount) {
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold 12px ${fn}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('⚠️ هذا الحساب عمره أقل من 7 أيام', 180, 282);
  }

  ctx.font = `11px ${fn}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const d = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(`FX9 • ${d}`, WIDTH - 20, HEIGHT - 12);

  if (!fontReady) await ensureFont();

  return canvas.toBuffer('image/png');
}
