import { createCanvas, loadImage } from '@napi-rs/canvas';

const BG_URL = 'https://j.top4top.io/p_3845prskm1.jpg';
const WIDTH = 800;
const HEIGHT = 400;

export async function generateWelcomeCard(member, guild) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const [bgImg, avatarImg] = await Promise.all([
    loadImage(BG_URL),
    loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 })),
  ]);

  ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const ax = 80, ay = 200, r = 70;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatarImg, ax - r, ay - r, r * 2, r * 2);
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('مرحباً بك', 180, 170);

  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(member.user.username, 180, 215);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`أنت العضو رقم #${guild.memberCount} في ${guild.name}`, 180, 258);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';
  ctx.fillText(`FX9 • ${new Date().toLocaleDateString('ar-SA')}`, WIDTH - 20, HEIGHT - 15);

  return canvas.toBuffer('image/png');
}
