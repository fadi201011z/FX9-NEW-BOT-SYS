import { createCanvas, loadImage } from '@napi-rs/canvas';

const BG_URL = 'https://j.top4top.io/p_3845prskm1.png';
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

async function loadBg() {
  if (bgCache) return bgCache;
  bgCache = await withTimeout(loadImage(BG_URL), 10000);
  return bgCache;
}

export async function generateWelcomeCard(member) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const [bgImg, avatarImg] = await Promise.all([
    loadBg().catch(async () => {
      bgCache = null;
      return withTimeout(loadImage(BG_URL), 10000);
    }),
    withTimeout(loadImage(member.user.displayAvatarURL({ extension: 'png', size: 512 })), 10000),
  ]);

  coverFit(ctx, bgImg, WIDTH, HEIGHT);

  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const cx = 1340, cy = 527, r = 253;
  const avatarR = 256;
  roundImage(ctx, avatarImg, cx, cy, avatarR);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();

  return canvas.toBuffer('image/png');
}
