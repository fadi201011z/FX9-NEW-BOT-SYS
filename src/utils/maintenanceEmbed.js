import { EmbedBuilder } from 'discord.js';

function formatDuration(milliseconds) {
  const totalSec = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (days > 0) parts.push(`**${days}** يوم`);
  if (hours > 0) parts.push(`**${hours}** ساعة`);
  if (minutes > 0) parts.push(`**${minutes}** دقيقة`);
  if (seconds > 0 && parts.length === 0) parts.push(`**${seconds}** ثانية`);
  return parts.join(' و ') || 'أقل من دقيقة';
}

export async function sendMaintenanceStart(client, channelId, message, endTime) {
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const now = Date.now();
  const remainMs = endTime ? Math.max(0, endTime - now) : 0;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'نظام الصيانة | Maintenance System',
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
    ].join('\n'))
    .setColor(0xF57C00)
    .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

  if (endTime) {
    embed.addFields(
      {
        name: '⏳ الوقت المتبقي',
        value: `┕ ${formatDuration(remainMs)}`,
        inline: true,
      },
      {
        name: '📅 ينتهي في',
        value: `┕ <t:${Math.floor(endTime / 1000)}:F>\n┕ <t:${Math.floor(endTime / 1000)}:R>`,
        inline: true,
      },
    );
  } else {
    embed.addFields({
      name: '⏳ المدة المتوقعة',
      value: '┕ غير محددة — سنعلمكم عند الانتهاء',
      inline: false,
    });
  }

  embed.addFields({
    name: '🕐 وقت البدء',
    value: `┕ <t:${Math.floor(now / 1000)}:F>\n┕ <t:${Math.floor(now / 1000)}:R>`,
    inline: endTime,
  });

  embed.setImage('https://i.imgur.com/5HjZxwH.png');

  embed.setFooter({
    text: 'FX9 System — شكراً لتفهمكم وانتظاركم | سنعود قريباً بأفضل حال',
    iconURL: client.user.displayAvatarURL(),
  });

  const warningEmbed = new EmbedBuilder()
    .setColor(0xFF6D00)
    .setDescription([
      '> ⚠️ **ملاحظة:** سيتم استئناف جميع الخدمات تلقائياً بمجرد انتهاء الصيانة. لا داعي للقلق.',
      '> 📢 للمتابعة والتحديثات، تابع قناة التحديثات الرسمية.',
    ].join('\n'));

  await channel.send({
    content: '🔔 **إشعار صيانة | Maintenance Notice**\n━━━━━━━━━━━━━━━━━━━━━━━━━',
    embeds: [embed, warningEmbed],
  }).catch(() => {});
}

export async function sendMaintenanceEnd(client, channelId, durationMinutes) {
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const now = Date.now();
  const totalMs = durationMinutes > 0 ? durationMinutes * 60 * 1000 : 0;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'نظام الصيانة | Maintenance System',
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

  embed.addFields(
    {
      name: '📅 وقت الانتهاء',
      value: `┕ <t:${Math.floor(now / 1000)}:F>\n┕ <t:${Math.floor(now / 1000)}:R>`,
      inline: true,
    },
  );

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
  } else {
    embed.addFields({
      name: '⏱ المدة الإجمالية',
      value: '┕ تمت العملية بنجاح',
      inline: true,
    });
  }

  embed.addFields({
    name: '💡 ملاحظة',
    value: '> إذا واجهت أي مشكلة أو خلل، يرجى التواصل مع فريق الدعم الفني عبر التكتات.',
    inline: false,
  });

  embed.setFooter({
    text: 'FX9 System — نعتذر عن أي إزعاج، وشكراً لثقتكم | نسعد بخدمتكم دائماً',
    iconURL: client.user.displayAvatarURL(),
  });

  await channel.send({
    content: '✅ **انتهاء الصيانة | Maintenance Completed**\n━━━━━━━━━━━━━━━━━━━━━━━━━',
    embeds: [embed],
  }).catch(() => {});
}
