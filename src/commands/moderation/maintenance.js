import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import Maintenance from '../../models/Maintenance.js';
import { setMaintenancePresence, clearMaintenancePresence } from '../../utils/presence.js';
import { sendMaintenanceStart, sendMaintenanceEnd } from '../../utils/maintenanceEmbed.js';
import { ROLES } from '../../config/roles.js';

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
      .addStringOption(opt =>
        opt.setName('message')
          .setDescription('رسالة الصيانة')
          .setMaxLength(500)
      )
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('روم إرسال الإشعار')
          .addChannelTypes(ChannelType.GuildText)
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
    const message  = interaction.options.getString('message');
    const channel  = interaction.options.getChannel('channel');

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

    if (message) doc.message = message;
    if (channel) doc.channelId = channel.id;

    await doc.save();

    setMaintenancePresence(interaction.client, doc.message);

    if (channel) {
      await sendMaintenanceStart(interaction.client, channel.id, doc.message, doc.endTime);
    } else if (doc.channelId) {
      await sendMaintenanceStart(interaction.client, doc.channelId, doc.message, doc.endTime);
    }

    const embed = new EmbedBuilder()
      .setColor(0xF57C00)
      .setTitle('🛠️ تم تفعيل وضع الصيانة')
      .setDescription([
        '> تم تشغيل وضع الصيانة بنجاح.',
        '',
        doc.durationMinutes > 0
          ? `⏱ **المدة:** ${doc.durationMinutes} دقيقة`
          : '⏱ **المدة:** غير محددة',
        channel ? `📢 **روم الإشعار:** <#${channel.id}>` : '',
      ].filter(Boolean).join('\n'))
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
      .setColor(0x4CAF50)
      .setTitle('✅ تم إيقاف وضع الصيانة')
      .setDescription('> تم إيقاف وضع الصيانة. جميع الخدمات تعمل بشكل طبيعي.')
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
        .setColor(0x4CAF50)
        .setTitle('🟢 وضع الصيانة')
        .setDescription('> الصيانة **غير مفعلة**. جميع الخدمات تعمل بشكل طبيعي.')
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    let timeInfo = 'غير محددة';
    if (doc.endTime) {
      const remain = Math.max(0, doc.endTime - Date.now());
      const mins = Math.floor(remain / 60000);
      const hours = Math.floor(mins / 60);
      const parts = [];
      if (hours > 0) parts.push(`${hours} س`);
      if (mins % 60 > 0) parts.push(`${mins % 60} د`);
      timeInfo = parts.join(' و ') || 'أقل من دقيقة';
    }

    const embed = new EmbedBuilder()
      .setColor(0xF57C00)
      .setTitle('🔴 وضع الصيانة — مفعل')
      .setDescription([
        `> ${doc.message || 'البوت تحت الصيانة'}`,
        '',
        `⏱ **المدة المتبقية:** ${timeInfo}`,
        doc.channelId ? `📢 **روم الإشعار:** <#${doc.channelId}>` : '',
      ].filter(Boolean).join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    console.error('[MaintenanceCmd] خطأ في عرض الحالة:', err.message);
    await interaction.reply({ content: '❌ فشل عرض حالة الصيانة.', flags: 64 });
  }
}
