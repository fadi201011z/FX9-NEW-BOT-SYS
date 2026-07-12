import { createCanvas, loadImage } from '@napi-rs/canvas';

const BG_URL = 'https://j.top4top.io/p_3845prskm1.png';
const WIDTH = 800;
const HEIGHT = 400;

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

export async function generateWelcomeCard(member, guild) {
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

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('👋 مرحباً بك', 180, 165);

  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(member.user.username, 180, 210);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`أنت العضو رقم #${guild.memberCount}`, 180, 248);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(guild.name, 180, 275);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, 290);
  ctx.lineTo(WIDTH - 40, 290);
  ctx.stroke();

  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'right';
  const d = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(`FX9 • ${d}`, WIDTH - 20, HEIGHT - 15);

  return canvas.toBuffer('image/png');
}
