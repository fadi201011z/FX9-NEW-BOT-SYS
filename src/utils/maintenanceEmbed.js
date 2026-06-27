import { EmbedBuilder } from 'discord.js';

const NOTIFY_ROLE_ID = '1499393262476329020';

function formatDuration(milliseconds) {
  const totalSec = Math.floor(milliseconds / 1000);
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
  let channel = client.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await client.channels.fetch(channelId);
    } catch { return null; }
  }
  return channel;
}

export async function sendMaintenanceStart(client, channelId, message, endTime) {
  const channel = await resolveChannel(client, channelId);
  if (!channel) return;

  const now = Date.now();
  const remainMs = endTime ? Math.max(0, endTime - now) : 0;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'FX9 — نظام الصيانة',
      iconURL: client.user.displayAvatarURL(),
    })
    .setTitle('🛠️ إشعار بصيانة البوت')
    .setDescription([
      `> ${message || 'نظام البوت قيد الصيانة والتطوير حالياً. نعمل جاهدين على تحسين الخدمة وتجربة أفضل لكم.'}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔹 **ما الذي يحدث؟**',
      '> يتم تحديث وتحسين النظام لضمان أفضل أداء وثبات للخدمة.',
      '',
      '🔹 **هل تتأثر الخدمات؟**',
      '> نعم، جميع أوامر البوت وحماية السيرفرات قد لا تعمل بشكل مؤقت.',
      '',
      '🔹 **متى سيعود العمل؟**',
      endTime
        ? `> بعد ${formatDuration(remainMs)} — سيتم استئناف الخدمات تلقائياً.`
        : '> لم تحدد مدة زمنية — سنعلمكم فور الانتهاء.',
    ].join('\n'))
    .setColor(0xF57C00)
    .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

  embed.setFooter({
    text: 'FX9 System — شكراً لتفهمكم وانتظاركم',
    iconURL: client.user.displayAvatarURL(),
  });

  const warningEmbed = new EmbedBuilder()
    .setColor(0xFF6D00)
    .setDescription([
      '> ⚠️ **ملاحظة:** سيتم استئناف جميع الخدمات تلقائياً بمجرد انتهاء الصيانة.',
      '> 📢 تابعوا الإعلانات في قناة التحديثات للمزيد من المعلومات.',
    ].join('\n'));

  try {
    await channel.send({
      content: `<@&${NOTIFY_ROLE_ID}> 🔔 **إشعار صيانة** — البوت قيد الصيانة حالياً`,
      embeds: [embed, warningEmbed],
    });
  } catch (err) {
    console.error(`[MaintenanceEmbed] فشل إرسال إشعار البدء إلى ${channelId}:`, err.message);
  }
}

export async function sendMaintenanceEnd(client, channelId, durationMinutes, changelog) {
  const channel = await resolveChannel(client, channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'FX9 — نظام الصيانة',
      iconURL: client.user.displayAvatarURL(),
    })
    .setTitle('✅ تم الانتهاء من الصيانة')
    .setDescription([
      '> 🎉 **تم بنجاح الانتهاء من جميع أعمال الصيانة والتحديث.**',
      '> النظام الآن يعمل بكامل طاقته وجميع الخدمات متاحة.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔹 **الخدمات المستعادة:**',
      '> ✅ جميع أوامر البوت — تعمل بكامل طاقتها',
      '> ✅ أنظمة الحماية — نشطة وجاهزة',
      '> ✅ التكتات والتذاكر — متاحة',
      '> ✅ الرومات المؤقتة — مفعلة',
      '> ✅ التنبيهات والإشعارات — تعمل',
      '> ✅ لوحة التحكم — متصلة ومتزامنة',
    ].join('\n'))
    .setColor(0x2E7D32)
    .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

  // ── Changelog fields ──────────────────────────────────────────────
  const cl = changelog || {};
  const botText = (cl.botUpdates || '').trim() || 'لم يتم إضافة تحديثات';
  const siteText = (cl.siteUpdates || '').trim() || 'لم يتم إضافة تحديثات';

  if (botText !== 'لم يتم إضافة تحديثات' || siteText !== 'لم يتم إضافة تحديثات') {
    embed.addFields({
      name: '📦 تحديثات البوت',
      value: botText.split('\n').map(l => l.trim() ? `> ${l.trim()}` : '').filter(Boolean).join('\n'),
      inline: false,
    });
    embed.addFields({
      name: '🌐 تحديثات الموقع',
      value: siteText.split('\n').map(l => l.trim() ? `> ${l.trim()}` : '').filter(Boolean).join('\n'),
      inline: false,
    });
  }

  if (durationMinutes > 0) {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const parts = [];
    if (hours > 0) parts.push(`**${hours}** ساعة`);
    if (mins > 0) parts.push(`**${mins}** دقيقة`);
    embed.addFields({
      name: '⏱ المدة الإجمالية',
      value: `┕ ${parts.join(' و ') || 'أقل من دقيقة'}`,
      inline: true,
    });
  }

  embed.addFields({
    name: '💡 ملاحظة',
    value: '> إذا واجهت أي مشكلة أو خلل بعد الصيانة، يرجى التواصل مع فريق الدعم الفني.',
    inline: false,
  });

  embed.setFooter({
    text: 'FX9 System — نعتذر عن أي إزعاج، وشكراً لثقتكم',
    iconURL: client.user.displayAvatarURL(),
  });

  try {
    await channel.send({
      content: `<@&${NOTIFY_ROLE_ID}> ✅ **انتهاء الصيانة** — جميع الخدمات متاحة الآن`,
      embeds: [embed],
    });
  } catch (err) {
    console.error(`[MaintenanceEmbed] فشل إرسال إشعار الانتهاء إلى ${channelId}:`, err.message);
  }
}
