import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Maintenance from '../../models/Maintenance.js';
import { setMaintenancePresence, clearMaintenancePresence } from '../../utils/presence.js';
import { sendMaintenanceStart, sendMaintenanceEnd } from '../../utils/maintenanceEmbed.js';
import { ROLES } from '../../config/roles.js';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const DEV_ID = process.env.BOT_DEVELOPER_ID || null;

function canManage(interaction) {
  if (DEV_ID && interaction.user.id === DEV_ID) return true;
  return interaction.member.roles?.cache?.has(ROLES.DEVELOPER[0]) || false;
}

export const data = new SlashCommandBuilder()
  .setName('maintenance')
  .setDescription('🛠️ إدارة وضع الصيانة للبوت')
  .addSubcommand(sub =>
    sub.setName('start')
      .setDescription('تشغيل وضع الصيانة')
      .addIntegerOption(opt =>
        opt.setName('duration')
          .setDescription('المدة بالدقائق (0 أو بدون = غير محددة)')
          .setMinValue(0)
      )
  )
  .addSubcommand(sub =>
    sub.setName('stop')
      .setDescription('إيقاف وضع الصيانة')
  )
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('عرض حالة الصيانة الحالية')
  );

export async function execute(interaction) {
  if (!canManage(interaction)) {
    return interaction.reply({
      content: '❌ ليس لديك صلاحية استخدام هذا الأمر. فقط المطورون يمكنهم ذلك.',
      flags: 64,
    });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    await handleStart(interaction);
  } else if (sub === 'stop') {
    await handleStop(interaction);
  } else if (sub === 'status') {
    await handleStatus(interaction);
  }
}

async function handleStart(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const duration = interaction.options.getInteger('duration');

    let doc = await Maintenance.findOne();
    if (!doc) doc = new Maintenance();

    doc.enabled = true;
    doc.updatedAt = Date.now();
    doc.updatedBy = interaction.user.id;

    if (duration !== null && duration > 0) {
      doc.endTime = Date.now() + duration * 60 * 1000;
      doc.durationMinutes = duration;
    } else {
      doc.endTime = null;
      doc.durationMinutes = 0;
    }

    await doc.save();

    setMaintenancePresence(interaction.client, doc.message);

    if (doc.channelId) {
      await sendMaintenanceStart(interaction.client, doc.channelId, doc.message, doc.endTime);
    }

    const embed = new EmbedBuilder()
      .setColor(0xE65100)
      .setTitle('🛠️  تم تفعيل الصيانة')
      .setDescription([
        '```ansi',
        '\u001b[1;31m🛠️  وضع الصيانة  │  مفعّل الآن\u001b[0m',
        '```',
        `${DIV}`,
        '',
        `**🛡️ بواسطة**  ─  ${interaction.user}`,
        doc.durationMinutes > 0
          ? `**⏱ المدة**  ─  ${doc.durationMinutes} دقيقة`
          : '**⏱ المدة**  ─  غير محددة',
        '',
        `${DIV}`,
        '',
        '> جميع الخدمات متوقفة مؤقتاً لحين انتهاء الصيانة',
      ].join('\n'))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[MaintenanceCmd] خطأ في بدء الصيانة:', err.message);
    await interaction.editReply({ content: `❌ فشل تشغيل الصيانة: ${err.message}` });
  }
}

async function handleStop(interaction) {
  await interaction.deferReply({ flags: 64 });

  try {
    const doc = await Maintenance.findOne();
    if (!doc || !doc.enabled) {
      return interaction.editReply({ content: '⚠️ الصيانة غير مفعلة أصلاً.' });
    }

    const oldChannelId = doc.channelId || '';
    const oldDuration  = doc.durationMinutes || 0;

    doc.enabled = false;
    doc.endTime = null;
    doc.durationMinutes = 0;
    doc.updatedAt = Date.now();
    doc.updatedBy = interaction.user.id;

    await doc.save();

    clearMaintenancePresence(interaction.client);

    if (oldChannelId) {
      await sendMaintenanceEnd(interaction.client, oldChannelId, oldDuration);
    }

    const embed = new EmbedBuilder()
      .setColor(0x1B5E20)
      .setTitle('✅  تم إيقاف الصيانة')
      .setDescription([
        '```ansi',
        '\u001b[1;32m✅  وضع الصيانة  │  متوقف — جميع الخدمات نشطة\u001b[0m',
        '```',
        `${DIV}`,
        '',
        `**🛡️ بواسطة**  ─  ${interaction.user}`,
        '',
        `${DIV}`,
        '',
        '> جميع الخدمات تعمل بكامل طاقتها الآن',
      ].join('\n'))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[MaintenanceCmd] خطأ في إيقاف الصيانة:', err.message);
    await interaction.editReply({ content: `❌ فشل إيقاف الصيانة: ${err.message}` });
  }
}

async function handleStatus(interaction) {
  try {
    const doc = await Maintenance.findOne().lean();

    if (!doc || !doc.enabled) {
      const embed = new EmbedBuilder()
        .setColor(0x2E7D32)
        .setTitle('🔵  حالة الصيانة')
        .setDescription([
          '```ansi',
          '\u001b[1;32m🟢  النظام  │  طبيعي — بدون صيانة\u001b[0m',
          '```',
          `${DIV}`,
          '',
          '> الصيانة **غير مفعلة**. جميع الخدمات تعمل بشكل طبيعي.',
        ].join('\n'))
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    let timeInfo = 'غير محددة';
    if (doc.endTime) {
      const remain = Math.max(0, doc.endTime - Date.now());
      const mins = Math.floor(remain / 60000);
      const parts = [];
      if (mins >= 60) { parts.push(`${Math.floor(mins / 60)} س`); }
      if (mins % 60 > 0) parts.push(`${mins % 60} د`);
      timeInfo = parts.join(' و ') || 'أقل من دقيقة';
    }

    const embed = new EmbedBuilder()
      .setColor(0xE65100)
      .setTitle('🔴  حالة الصيانة')
      .setDescription([
        '```ansi',
        '\u001b[1;31m🔴  الصيانة  │  مفعّلة حالياً\u001b[0m',
        '```',
        `${DIV}`,
        '',
        `**📝 الرسالة**  ─  ${doc.message || 'البوت تحت الصيانة'}`,
        `**⏱ المتبقي**  ─  ${timeInfo}`,
        doc.channelId ? `**📢 الإشعار**  ─  <#${doc.channelId}>` : '',
        '',
        `${DIV}`,
      ].join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    console.error('[MaintenanceCmd] خطأ في عرض الحالة:', err.message);
    await interaction.reply({ content: '❌ فشل عرض حالة الصيانة.', flags: 64 });
  }
}
