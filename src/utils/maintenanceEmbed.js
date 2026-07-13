import { EmbedBuilder } from 'discord.js';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const NOTIFY_ROLE_ID = '1499393262476329020';

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`**${days}** يوم`);
  if (hours > 0) parts.push(`**${hours}** ساعة`);
  if (minutes > 0) parts.push(`**${minutes}** دقيقة`);
  if (parts.length === 0) parts.push('**أقل من دقيقة**');
  return parts.join(' و ');
}

async function resolveChannel(client, channelId) {
  if (!channelId) return null;
  let ch = client.channels.cache.get(channelId);
  if (!ch) { try { ch = await client.channels.fetch(channelId); } catch { return null; } }
  return ch;
}

export async function sendMaintenanceStart(client, channelId, message, endTime) {
  const channel = await resolveChannel(client, channelId);
  if (!channel) return;

  const now = Date.now();
  const remainMs = endTime ? Math.max(0, endTime - now) : 0;

  const embed = new EmbedBuilder()
    .setColor(0xBF360C)
    .setTitle('🛠️  إشعار صيانة — البوت قيد الصيانة')
    .setDescription([
      '```ansi',
      '\u001b[1;31m🔴  SYSTEM MAINTENANCE  │  جميع الخدمات متوقفة مؤقتاً\u001b[0m',
      '```',
      `${DIV}`,
      '',
      `**📝 البيان**  ─  ${message || 'نظام البوت قيد الصيانة والتطوير حالياً'}`,
      '',
      `${DIV}`,
      '',
      '**🔹 ما الذي يحدث؟**',
      '> يتم تحديث وتحسين النظام لضمان أفضل أداء وثبات للخدمة.',
      '',
      '**🔹 هل تتأثر الخدمات؟**',
      '> نعم، جميع أوامر البوت وأنظمة الحماية قد لا تعمل بشكل مؤقت.',
      '',
      '**🔹 متى سيعود العمل؟**',
      endTime
        ? `> بعد ${formatDuration(remainMs)} — سيتم استئناف الخدمات تلقائياً.`
        : '> لم تحدد مدة زمنية — سنعلمكم فور الانتهاء.',
      '',
      `${DIV}`,
      '',
      '> ⚠️ سيتم استئناف جميع الخدمات تلقائياً بمجرد انتهاء الصيانة',
    ].join('\n'))
    .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
    .setFooter({ text: 'FX9 System — شكراً لتفهمكم', iconURL: client.user.displayAvatarURL() });

  try {
    await channel.send({
      content: `<@&${NOTIFY_ROLE_ID}> 🔔 **إشعار صيانة** — البوت قيد الصيانة حالياً`,
      embeds: [embed],
    });
  } catch (err) {
    console.error(`[MaintenanceEmbed] فشل إرسال إشعار البدء إلى ${channelId}:`, err.message);
  }
}

export async function sendMaintenanceEnd(client, channelId, durationMinutes, changelog) {
  const channel = await resolveChannel(client, channelId);
  if (!channel) return;

  const durationStr = durationMinutes > 0
    ? (() => {
        const h = Math.floor(durationMinutes / 60);
        const m = durationMinutes % 60;
        const p = [];
        if (h > 0) p.push(`**${h}** ساعة`);
        if (m > 0) p.push(`**${m}** دقيقة`);
        return p.join(' و ') || 'أقل من دقيقة';
      })()
    : null;

  const desc = [
    '```ansi',
    '\u001b[1;32m✅  MAINTENANCE COMPLETE  │  جميع الخدمات متاحة الآن\u001b[0m',
    '```',
    `${DIV}`,
    '',
    '**🔹 الخدمات المستعادة:**',
    '> ✅ جميع أوامر البوت — تعمل بكامل طاقتها',
    '> ✅ أنظمة الحماية — نشطة وجاهزة',
    '> ✅ التكتات والتذاكر — متاحة',
    '> ✅ الرومات المؤقتة — مفعلة',
    '> ✅ التنبيهات والإشعارات — تعمل',
    '> ✅ لوحة التحكم — متصلة ومتزامنة',
    '',
    `${DIV}`,
    durationStr ? `\n**⏱ المدة الإجمالية**  ─  ${durationStr}\n` : '',
    '> إذا واجهت أي مشكلة بعد الصيانة، يرجى التواصل مع فريق الدعم.',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x1B5E20)
    .setTitle('✅  تم الانتهاء من الصيانة')
    .setDescription(desc)
    .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
    .setFooter({ text: 'FX9 System — نعتذر عن أي إزعاج، وشكراً لثقتكم', iconURL: client.user.displayAvatarURL() });

  const cl = changelog || {};
  const botText = (cl.botUpdates || '').trim();
  const siteText = (cl.siteUpdates || '').trim();

  if (botText) {
    embed.addFields({
      name: '📦 تحديثات البوت',
      value: botText.split('\n').map(l => l.trim() ? `> ${l.trim()}` : '').filter(Boolean).join('\n'),
    });
  }
  if (siteText) {
    embed.addFields({
      name: '🌐 تحديثات الموقع',
      value: siteText.split('\n').map(l => l.trim() ? `> ${l.trim()}` : '').filter(Boolean).join('\n'),
    });
  }

  try {
    await channel.send({
      content: `<@&${NOTIFY_ROLE_ID}> ✅ **انتهاء الصيانة** — جميع الخدمات متاحة الآن`,
      embeds: [embed],
    });
  } catch (err) {
    console.error(`[MaintenanceEmbed] فشل إرسال إشعار الانتهاء إلى ${channelId}:`, err.message);
  }
}
