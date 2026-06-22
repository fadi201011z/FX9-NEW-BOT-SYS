import { EmbedBuilder } from 'discord.js';

export async function sendMaintenanceStart(client, channelId, message, endTime) {
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('🔧 صيانة مجدولة')
    .setDescription(message || 'نظام البوت قيد الصيانة حالياً. نعمل على تحسين الخدمة لكم.')
    .setColor(0xF57C00)
    .setTimestamp();

  if (endTime) {
    const remainMs = Math.max(0, endTime - Date.now());
    const mins = Math.floor(remainMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    let durationText = '';
    if (days > 0) durationText += `${days} يوم `;
    if (hours % 24 > 0) durationText += `${hours % 24} ساعة `;
    if (mins % 60 > 0) durationText += `${mins % 60} دقيقة`;
    embed.addFields({ name: '⏱ المدة المتبقية', value: durationText || 'أقل من دقيقة', inline: true });
    embed.addFields({ name: '🕐 ينتهي في', value: `<t:${Math.floor(endTime / 1000)}:F>`, inline: true });
  } else {
    embed.addFields({ name: '⏱ المدة', value: 'غير محددة', inline: true });
  }

  embed.setFooter({ text: 'شكراً لتفهمك — سنعود قريباً' });

  await channel.send({ embeds: [embed] }).catch(() => {});
}

export async function sendMaintenanceEnd(client, channelId, durationMinutes) {
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('✅ انتهت الصيانة')
    .setDescription('تم الانتهاء من أعمال الصيانة والتحديث. النظام يعمل بكامل طاقته الآن.')
    .setColor(0x4CAF50)
    .setTimestamp();

  if (durationMinutes > 0) {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    let durationText = '';
    if (hours > 0) durationText += `${hours} ساعة `;
    if (mins > 0) durationText += `${mins} دقيقة`;
    embed.addFields({ name: '⏱ المدة الإجمالية', value: durationText || 'أقل من دقيقة', inline: true });
  }

  embed.setFooter({ text: 'نعتذر عن أي إزعاج — شكراً لتواجدكم' });

  await channel.send({ embeds: [embed] }).catch(() => {});
}
