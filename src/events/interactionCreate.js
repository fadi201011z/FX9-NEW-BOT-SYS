import {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from 'discord.js';
import { isCommandEnabled, canMemberUseCommand } from '../database.js';
import Maintenance from '../models/Maintenance.js';
import { ROLES } from '../config/roles.js';

const DEV_ID = process.env.BOT_DEVELOPER_ID || null;

async function isMaintenanceActive() {
  try {
    const doc = await Maintenance.findOne().lean();
    if (!doc || !doc.enabled) return false;
    if (doc.endTime && Date.now() >= doc.endTime) {
      await Maintenance.updateOne({ _id: doc._id }, { $set: { enabled: false, endTime: null, durationMinutes: 0 } });
      return false;
    }
    return doc.message || 'البوت تحت الصيانة والتطوير حالياً. انتظر لوقت لاحق.';
  } catch { return false; }
}

function canBypassMaintenance(member) {
  if (DEV_ID && member.id === DEV_ID) return true;
  if (member.guild?.ownerId === member.id) return true;
  return member.roles?.cache?.has(ROLES.DEVELOPER[0]) || false;
}

async function blockIfMaintenance(interaction) {
  if (!interaction.guildId || !interaction.member) return false;
  const mntMsg = await isMaintenanceActive();
  if (mntMsg && !canBypassMaintenance(interaction.member)) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `🔧 **${mntMsg}**\n> نعمل على تحسين البوت لكم. سنعود قريباً بأفضل حال.`, flags: 64 }).catch(() => {});
    } else {
      await interaction.reply({ content: `🔧 **${mntMsg}**\n> نعمل على تحسين البوت لكم. سنعود قريباً بأفضل حال.`, flags: 64 }).catch(() => {});
    }
    return true;
  }
  return false;
}

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  try {

    // ══════════════════════════════════════════════════════════════════════
    //  Slash Commands
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.client.commands.get(interaction.commandName);
      if (!cmd) return;

      // ── Maintenance mode check ────────────────────────────────────────────
      if (interaction.guildId && interaction.member) {
        const mntMsg = await isMaintenanceActive();
        if (mntMsg && !canBypassMaintenance(interaction.member)) {
          await interaction.reply({
            content: `🔧 **${mntMsg}**\n> نعمل على تحسين البوت لكم. سنعود قريباً بأفضل حال.`,
            flags: 64,
          }).catch(() => {});
          return;
        }
      }

      if (interaction.guildId && !isCommandEnabled(interaction.guildId, interaction.commandName)) {
        interaction.reply({
          content: `⚠️ **الأمر \`/${interaction.commandName}\` معطل في هذا السيرفر.** لا يمكنك استخدامه حالياً. انتظر حتى يعيد المشرف تفعيله.`,
          flags: 64,
        });
        return;
      }

      if (interaction.guildId && interaction.member) {
        const memberRoles = interaction.member.roles?.cache?.map(r => r.id) || [];
        if (!canMemberUseCommand(interaction.guildId, interaction.commandName, memberRoles)) {
          interaction.reply({
            content: `🚫 **ليس لديك صلاحية استخدام \`/${interaction.commandName}\`.** أنت لا تملك الرتب المطلوبة أو رتبتك ممنوعة من استخدام هذا الأمر.`,
            flags: 64,
          });
          return;
        }
      }

      try {
        await cmd.execute(interaction, interaction.client);
      } catch (err) {
        // If cmd.execute took only 1 arg, the 2nd will be silently ignored
        // If it still threw, try without client
        if (err && !err.message?.includes?.('is not a function')) {
          try { await cmd.execute(interaction); return; } catch {}
        }
        throw err;
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  String Select Menus
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu()) {
      if (await blockIfMaintenance(interaction)) return;
      const { handleCategorySelect, handleQuickReply } = await import('../handlers/ticketHandler.js');

      if (interaction.customId === 'ticket_category') {
        return handleCategorySelect(interaction);
      }
      if (interaction.customId === 'ticket_quickreply') {
        return handleQuickReply(interaction.client, interaction);
      }

      if (interaction.customId === 'ticket_log_menu') {
        const { handleTicketLogMenu } = await import('../handlers/ticketLogMenu.js');
        return handleTicketLogMenu(interaction.client, interaction);
      }

      // ═══════════════════════════════════════════════════════════════
      //  Help Menu
      // ═══════════════════════════════════════════════════════════════
      if (interaction.customId === 'help_menu') {
        const value = interaction.values[0];
        const emb = new EmbedBuilder().setColor(0x5865f2).setTimestamp();

        switch (value) {
          case 'help_setup':
            emb
              .setTitle('⚙️ الإعدادات — دليل الأوامر')
              .setDescription('الأوامر الموحّدة لإعداد جميع الأنظمة')
              .addFields(
                { name: '🎛️ الإعداد الموحّد', value: '`/setup`  ← فتح قائمة اختيار النظام الذي تريد إعداده', inline: false },
                { name: '🎫 التكتات', value: [
                  '`/configt setup`           ← تشغيل معالج الإعداد',
                  '`/configt panel_channel`   ← تعيين قناة البنل',
                  '`/configt ticket_category` ← فئة التكتات',
                  '`/configt admin_category`  ← فئة الإدارة (الريلاي)',
                  '`/configt support_role`    ← إضافة/إزالة رتب الدعم',
                  '`/configt log_channel`     ← قناة السجلات',
                  '`/configt show`            ← عرض الإعدادات',
                  '`/configt reset`           ← مسح الإعدادات',
                ].join('\n'), inline: false },
                { name: '🎙️ الصوت المؤقت', value: [
                  '`/setup-voice category #join #text` ← إعداد القنوات المؤقتة',
                  '> **category**: الفئة التي تُنشأ فيها القنوات',
                  '> **join_channel**: قناة الصوت "انضم لإنشاء قناة"',
                  '> **text_channel**: القناة النصية للوحة التحكم',
                ].join('\n'), inline: false },
                { name: '⚙️ عام', value: [
                  '`/setup-welcome #قناة`    ← تعيين قناة الترحيب',
                  '`/setup-logs #قناة`       ← تعيين قناة السجلات العامة',
                  '`/setup-modlogs #قناة`    ← تعيين قناة سجلات الإشراف',
                  '`/setup-botlogs #قناة`    ← تعيين قناة سجل البوت',
                  '`/setup-stats`             ← إعداد قنوات الإحصائيات الصوتية',
                  '`/config`                  ← عرض الإعدادات الحالية',
                ].join('\n'), inline: false },
              );
            break;
          case 'help_mod':
            emb
              .setTitle('🔨 الإشراف — دليل الأوامر')
              .setDescription('صلاحية مطلوبة: **إدارة القنوات** أو **طرد الأعضاء**')
              .addFields(
                { name: 'العقوبات', value: [
                  '`/ban @عضو [سبب]`         — حظر دائم',
                  '`/kick @عضو [سبب]`        — طرد',
                  '`/timeout @عضو 10m/1h/1d` — إيقاف مؤقت',
                  '`/warn add/list/clear`    — نظام التحذيرات',
                ].join('\n'), inline: false },
                { name: 'إدارة القنوات', value: [
                  '`/clear 1-100 [@عضو]`     — مسح رسائل',
                  '`/slowmode ثوانٍ`          — وضع البطء',
                  '`/lock [#قناة]`            — إغلاق قناة',
                  '`/unlock [#قناة]`          — فتح قناة',
                  '`/hide [#قناة]`            — إخفاء قناة',
                  '`/unhide [#قناة]`          — إظهار قناة',
                ].join('\n'), inline: false },
                { name: 'إدارة الأعضاء', value: [
                  '`/nick @عضو [لقب]`         — تغيير اللقب',
                  '`/role add/remove @عضو @رتبة` — إدارة الأدوار',
                ].join('\n'), inline: false },
              );
            break;
          case 'help_ticket':
            emb
              .setTitle('🎫 التكتات — دليل الأوامر')
              .setDescription('نظام تكتات دعم فني متكامل مع تقييم وإشعارات')
              .addFields(
                { name: 'أوامر التكتات', value: [
                  '`/configt`                 ← إعداد نظام التكتات (7 إجراءات)',
                  '`/ticket`                  ← فتح تكت جديد',
                  '`/panel`                   ← إرسال بنل التحكم بالتكتات',
                  '`/announce`                ← إرسال إشعار للكل',
                  '`/helpt`                   ← دليل أوامر التكتات',
                  '`/botinfo`                 ← معلومات البوت',
                  '`/ratings`                 ← عرض التقييمات',
                  '`/stats`                   ← إحصائيات التكتات',
                  '`/remind`                  ← تذكير الأعضاء',
                ].join('\n'), inline: false },
              );
            break;
          case 'help_voice':
            emb
              .setTitle('🎵 الصوت والموسيقى — دليل الأوامر')
              .setDescription('القنوات الصوتية المؤقتة + مشغل الموسيقى')
              .addFields(
                { name: 'القنوات المؤقتة', value: [
                  '`/setup-voice`             ← إعداد النظام',
                  '`/vchelp`                  ← دليل التحكم بالقناة',
                  '> أزرار التحكم (في لوحة القناة المؤقتة):',
                  '> 🔒/🔓 قفل/فتح   🙈/👁️ إخفاء/إظهار',
                  '> 👥 تحديد العدد  ✏️ إعادة تسمية  👢 طرد  👑 نقل ملكية',
                ].join('\n'), inline: false },
                { name: 'مشغل الموسيقى', value: [
                  '`/play اسم/رابط`           ← تشغيل أغنية',
                  '`/search كلمة`             ← بحث واختيار',
                  '`/queue`                    ← عرض القائمة',
                  '`/nowplaying`               ← الأغنية الحالية',
                  '`/skip`                     ← تخطي',
                  '`/stop`                     ← إيقاف',
                  '`/pause`                    ← إيقاف مؤقت',
                  '`/loop`                     ← تكرار (أغنية/قائمة)',
                  '`/shuffle`                  ← خلط القائمة',
                  '`/remove رقم`              ← إزالة من القائمة',
                  '`/clearqueue`               ← مسح القائمة',
                  '`/volume 0-100`            ← مستوى الصوت',
                  '`/vping`                    ← سرعة الاستجابة',
                ].join('\n'), inline: false },
              );
            break;
          case 'help_info':
            emb
              .setTitle('📊 المعلومات — دليل الأوامر')
              .setDescription('معلومات عامة عن السيرفر والبوت')
              .addFields(
                { name: 'أوامر المعلومات', value: [
                  '`/ping`          ← زمن استجابة البوت',
                  '`/sysinfo`       ← معلومات البوت والمطور',
                  '`/botinfo`       ← معلومات البوت (نظام التكتات)',
                  '`/serverinfo`    ← إحصائيات السيرفر',
                  '`/userinfo [@]`  ← معلومات عضو + تحذيراته',
                  '`/config`        ← إعدادات السيرفر الحالية',
                  '`/help`          ← هذا الدليل',
                ].join('\n'), inline: false },
              );
            break;
          case 'help_members':
            emb
              .setTitle('👥 الأعضاء — دليل الأوامر')
              .setDescription('أوامر مخصصة لجميع الأعضاء')
              .addFields(
                { name: 'أوامر الأعضاء', value: [
                  '`/profile [@]`   ← ملف شخصي كامل (أدوار، تواريخ، تحذيرات)',
                  '`/avatar [@]`    ← عرض الصورة الشخصية بأعلى دقة',
                  '`/rank [@]`      ← ترتيب العضو حسب تاريخ الانضمام',
                  '`/rules`         ← عرض قوانين السيرفر',
                ].join('\n'), inline: false },
              );
            break;
          case 'help_protection':
            emb
              .setTitle('🛡️ الحماية التلقائية — نظرة عامة')
              .setDescription('أنظمة حماية مدمجة تعمل تلقائياً بدون أوامر')
              .addFields(
                { name: 'Anti-Spam',    value: '5 رسائل خلال 5 ثوانٍ ← إيقاف كتابة 60 ثانية + تسجيل', inline: false },
                { name: 'Anti-Link',    value: 'حذف الروابط + تسجيل في سجل الإشراف', inline: false },
                { name: 'Anti-Mention', value: '5+ منشنات في رسالة واحدة ← حذف فوري + تسجيل', inline: false },
                { name: 'Anti-Nuke',    value: '3+ حذف قنوات / 5+ حظر خلال 10 ثوانٍ ← سحب صلاحيات المسؤول + إشعار', inline: false },
                { name: 'Raid',         value: '10+ انضمامات خلال 10 ثوانٍ ← تفعيل وضع الحماية', inline: false },
                { name: 'Bot Log',      value: 'إشعار بكل تشغيل/إيقاف/خطأ + تقرير دوري كل 10 دقائق', inline: false },
              );
            break;
        }

        return interaction.reply({ embeds: [emb], flags: 64 });
      }

      // ═══════════════════════════════════════════════════════════════
      //  Setup Menu
      // ═══════════════════════════════════════════════════════════════
      if (interaction.customId === 'setup_menu') {
        const value = interaction.values[0];
        const emb = new EmbedBuilder().setColor(0x5865f2).setTimestamp();

        switch (value) {
          case 'setup_ticket':
            emb
              .setTitle('🎫 إعداد نظام التكتات')
              .setDescription('اتبع الخطوات التالية بالترتيب:')
              .addFields(
                { name: '1️⃣ الإعداد الأساسي', value: '`/configt setup` ← تشغيل معالج الإعداد التلقائي', inline: false },
                { name: '2️⃣ تعيين القنوات', value: [
                  '`/configt panel_channel #قناة`  ← القناة التي سيظهر فيها بنل فتح التكت',
                  '`/configt ticket_category #فئة` ← الفئة التي تُنشأ فيها تكتات الأعضاء',
                ].join('\n'), inline: false },
                { name: '3️⃣ نظام القنوات المزدوجة (اختياري)', value: '`/configt admin_category #فئة` ← تفعيل الريلاي (قناة للمستخدم + قناة للإدارة)', inline: false },
                { name: '4️⃣ رتب الدعم', value: '`/configt support_role add @رتبة` ← إضافة رتب الدعم (كرر للإضافة)', inline: false },
                { name: '5️⃣ سجل التكتات', value: '`/configt log_channel #قناة` ← تعيين قناة لتسجيل التكتات المغلقة', inline: false },
                { name: '✅ بعد الإعداد', value: '`/panel` ← إرسال بنل فتح التكت في القناة المحددة', inline: false },
              );
            break;
          case 'setup_voice':
            emb
              .setTitle('🎙️ إعداد القنوات الصوتية المؤقتة')
              .setDescription('نظام Join-to-Create مع لوحة تحكم كاملة')
              .addFields(
                { name: '1️⃣ إنشاء الهيكل المطلوب', value: [
                  '① أنشئ **فئة (Category)** جديدة — مثلاً "🎤 القنوات الصوتية"',
                  '② أنشئ **قناة صوتية** باسم "➕ انضم لإنشاء قناة" داخل الفئة',
                  '③ أنشئ **قناة نصية** باسم "🎛️ التحكم" داخل الفئة',
                ].join('\n'), inline: false },
                { name: '2️⃣ تشغيل أمر الإعداد', value: [
                  '`/setup-voice category:#الفئة join_channel:#انضم text_channel:#التحكم`',
                  '> ✅ سيتم حفظ الإعدادات وإرسال لوحة التحكم تلقائياً',
                ].join('\n'), inline: false },
                { name: '🔹 ملاحظة', value: 'الإعدادات تُحفظ تلقائياً ولا تحتاج لإعادة بعد ريستارت.', inline: false },
              );
            break;
          case 'setup_general':
            emb
              .setTitle('⚙️ الإعدادات العامة')
              .setDescription('الترحيب، السجلات، الإحصائيات، ورتب الإشراف')
              .addFields(
                { name: '🎉 قناة الترحيب', value: '`/setup-welcome #قناة` ← رسالة ترحيب عند دخول عضو جديد', inline: false },
                { name: '📋 السجلات العامة', value: '`/setup-logs #قناة` ← تسجيل حذف/تعديل الرسائل، دخول/خروج الأعضاء', inline: false },
                { name: '📝 سجلات الإشراف', value: '`/setup-modlogs #قناة` ← تسجيل جميع أوامر الإشراف + العقوبات', inline: false },
                { name: '📊 الإحصائيات', value: '`/setup-stats` ← إنشاء قنوات صوتية تعرض إحصائيات السيرفر (تتحدث كل دقيقة)', inline: false },
                { name: '🔍 عرض الإعدادات', value: '`/config` ← عرض جميع الإعدادات الحالية في السيرفر', inline: false },
              );
            break;
          case 'setup_bot':
            emb
              .setTitle('🤖 إعدادات البوت')
              .setDescription('إعداد سجل البوت ومعلومات النظام')
              .addFields(
                { name: '📟 سجل البوت', value: '`/setup-botlogs #قناة` ← تسجيل حالات التشغيل/الإيقاف/الأخطاء + تقرير دوري', inline: false },
                { name: 'ℹ️ معلومات النظام', value: [
                  '`/sysinfo`  ← معلومات عن البوت والمطور',
                  '`/config`   ← عرض إعدادات السيرفر الحالية',
                ].join('\n'), inline: false },
              );
            break;
        }

        return interaction.reply({ embeds: [emb], flags: 64 });
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Modal Submissions
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      if (await blockIfMaintenance(interaction)) return;
      const id = interaction.customId;

      // Ticket modals
      if (id.startsWith('ticket_modal_')) {
        const { handleTicketModalSubmit } = await import('../handlers/ticketHandler.js');
        return handleTicketModalSubmit(interaction.client, interaction);
      }
      if (id === 'ticket_rename_modal') {
        const { handleRenameModalSubmit } = await import('../handlers/ticketHandler.js');
        return handleRenameModalSubmit(interaction.client, interaction);
      }

      // Temp Voice modals
      if (id === 'modal_vc_limit') {
        const { getChannelByOwner } = await import('../handlers/tempVoice.js');
        const owned = getChannelByOwner(interaction.guildId, interaction.member.id);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply({ content: '❌ ليس لديك قناة نشطة.', ephemeral: true });
        const val = parseInt(interaction.fields.getTextInputValue('limit_value'), 10);
        if (isNaN(val) || val < 0 || val > 99)
          return interaction.reply({ content: '❌ أدخل رقماً بين 0 و 99.', ephemeral: true });
        await vc.setUserLimit(val);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`👥 تم تحديد حد قناة **${vc.name}**: **${val === 0 ? 'بلا حدود' : `${val} أعضاء`}**`)
            .setColor(0x5865f2)],
          ephemeral: true,
        });
      }

      if (id === 'modal_vc_rename') {
        const { getChannelByOwner } = await import('../handlers/tempVoice.js');
        const owned = getChannelByOwner(interaction.guildId, interaction.member.id);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply({ content: '❌ ليس لديك قناة نشطة.', ephemeral: true });
        const name = interaction.fields.getTextInputValue('rename_value').trim();
        if (!name) return interaction.reply({ content: '❌ الاسم فارغ.', ephemeral: true });
        await vc.setName(name);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`✅ تم تغيير اسم قناتك إلى: **${name}**`)
            .setColor(0x57f287)],
          ephemeral: true,
        });
      }

      if (id === 'modal_vc_kick') {
        const { getChannelByOwner } = await import('../handlers/tempVoice.js');
        const owned = getChannelByOwner(interaction.guildId, interaction.member.id);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply({ content: '❌ ليس لديك قناة نشطة.', ephemeral: true });
        const targetId = interaction.fields.getTextInputValue('kick_id').trim();
        const target = vc.members.get(targetId);
        if (!target) return interaction.reply({ content: '❌ العضو غير موجود في قناتك.', ephemeral: true });
        if (target.id === interaction.member.id) return interaction.reply({ content: '❌ لا تستطيع طرد نفسك.', ephemeral: true });
        await target.voice.disconnect();
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`👢 تم طرد **${target.displayName}** من قناتك.`)
            .setColor(0xed4245)],
          ephemeral: true,
        });
      }

      if (id === 'modal_vc_transfer') {
        const { getChannelByOwner, getChannel } = await import('../handlers/tempVoice.js');
        const owned = getChannelByOwner(interaction.guildId, interaction.member.id);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply({ content: '❌ ليس لديك قناة نشطة.', ephemeral: true });
        const targetId = interaction.fields.getTextInputValue('transfer_id').trim();
        const target = vc.members.get(targetId);
        if (!target) return interaction.reply({ content: '❌ العضو غير موجود في قناتك.', ephemeral: true });
        if (target.user.bot) return interaction.reply({ content: '❌ لا تستطيع نقل الملكية لبوت.', ephemeral: true });
        if (target.id === interaction.member.id) return interaction.reply({ content: '❌ أنت المالك بالفعل.', ephemeral: true });
        const chData = getChannel(owned.vcId);
        if (chData) chData.ownerId = target.id;
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setDescription(`👑 نُقلت ملكية **${vc.name}** إلى **${target.displayName}**`)
            .setColor(0xfee75c)],
          ephemeral: true,
        });
      }

      // Music add modal
      if (id === 'modal_music_add') {
        const { searchTrack } = await import('../handlers/music.js');
        await interaction.deferReply({ ephemeral: true });
        const queue = interaction.client.musicQueues.get(interaction.guildId);
        if (!queue) return interaction.editReply({ content: '❌ لا يوجد مشغّل نشط.' });
        const tracks = await searchTrack(interaction.fields.getTextInputValue('track_query'), interaction.user.tag);
        if (!tracks?.length) return interaction.editReply({ content: '❌ لم يُعثر على نتائج.' });
        queue.tracks.push(...tracks);
        return interaction.editReply({
          content: `✅ تمت إضافة **${tracks.length === 1 ? tracks[0].title : `${tracks.length} مقاطع`}** للقائمة.`,
        });
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Buttons
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      if (await blockIfMaintenance(interaction)) return;
      const id = interaction.customId;

      // ── Rating buttons (ticket system) ──────────────────────────────
      if (id.startsWith('rate_')) {
        const { handleRatingButton } = await import('../handlers/closeHandler.js');
        return handleRatingButton(interaction.client, interaction);
      }

      // ── Ticket buttons ──────────────────────────────────────────────
      if (['ticket_claim', 'ticket_unclaim', 'ticket_rename', 'ticket_close'].includes(id)) {
        const { updateTicketActivity } = await import('../handlers/inactivityHandler.js');
        updateTicketActivity(interaction.channelId);

        const { handleClaimTicket, handleUnclaimTicket, handleRenameTicket } = await import('../handlers/ticketHandler.js');
        const { handleCloseTicket } = await import('../handlers/closeHandler.js');

        switch (id) {
          case 'ticket_claim':   return handleClaimTicket(interaction.client, interaction);
          case 'ticket_unclaim': return handleUnclaimTicket(interaction.client, interaction);
          case 'ticket_rename':  return handleRenameTicket(interaction);
          case 'ticket_close':   return handleCloseTicket(interaction.client, interaction);
        }
      }

      // ── Temp Voice buttons ──────────────────────────────────────────
      if (id.startsWith('vc_')) {
        const { getChannelByOwner, deleteChannel } = await import('../handlers/tempVoice.js');
        const { checkCooldown } = await import('../utils/cooldown.js');
        const member = interaction.member;

        const owned = getChannelByOwner(interaction.guildId, member.id);
        if (!owned) {
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setDescription(
                '❌ **ليس لديك قناة صوتية نشطة.**\n' +
                'انضم إلى قناة ➕ لإنشاء قناتك الخاصة أولاً.'
              )
              .setColor(0xed4245)],
            ephemeral: true,
          });
        }

        const vc = interaction.guild.channels.cache.get(owned.vcId);
        if (!vc) {
          deleteChannel(owned.vcId);
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setDescription('❌ **قناتك لم تعد موجودة.**\nانضم إلى قناة ➕ لإنشاء قناة جديدة.')
              .setColor(0xed4245)],
            ephemeral: true,
          });
        }

        const rem = checkCooldown(member.id, id);
        if (rem > 0) {
          return interaction.reply({ content: `⏳ انتظر **${(rem / 1000).toFixed(1)}ث**.`, ephemeral: true });
        }

        try {
          if (id === 'vc_lock') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
            return interaction.reply({
              embeds: [new EmbedBuilder()
                .setDescription(`🔒 تم قفل قناتك **${vc.name}** — لا يمكن لأحد الانضمام.`)
                .setColor(0xed4245)],
              ephemeral: true,
            });
          }

          if (id === 'vc_unlock') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
            return interaction.reply({
              embeds: [new EmbedBuilder()
                .setDescription(`🔓 تم فتح قناتك **${vc.name}** للجميع.`)
                .setColor(0x57f287)],
              ephemeral: true,
            });
          }

          if (id === 'vc_hide') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
            return interaction.reply({
              embeds: [new EmbedBuilder()
                .setDescription(`🙈 تم إخفاء قناتك **${vc.name}**.`)
                .setColor(0x99aab5)],
              ephemeral: true,
            });
          }

          if (id === 'vc_show') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
            return interaction.reply({
              embeds: [new EmbedBuilder()
                .setDescription(`👁️ تم إظهار قناتك **${vc.name}**.`)
                .setColor(0x57f287)],
              ephemeral: true,
            });
          }

          if (id === 'vc_limit') {
            const modal = new ModalBuilder().setCustomId('modal_vc_limit').setTitle('تحديد عدد الأعضاء');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('limit_value')
                .setLabel('العدد الأقصى (0 = بلا حدود)')
                .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2)
                .setPlaceholder('مثال: 5').setRequired(true)
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_rename') {
            const modal = new ModalBuilder().setCustomId('modal_vc_rename').setTitle('تسمية القناة');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('rename_value')
                .setLabel('الاسم الجديد').setStyle(TextInputStyle.Short)
                .setMaxLength(32).setRequired(true)
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_kick') {
            const modal = new ModalBuilder().setCustomId('modal_vc_kick').setTitle('طرد عضو من القناة');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('kick_id')
                .setLabel('معرّف العضو (User ID)')
                .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_transfer') {
            const modal = new ModalBuilder().setCustomId('modal_vc_transfer').setTitle('نقل الملكية');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('transfer_id')
                .setLabel('معرّف العضو الجديد (User ID)')
                .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
            ));
            return interaction.showModal(modal);
          }
        } catch (err) {
          console.error('[TempVC Button]', err.message);
          return interaction.reply({ content: '❌ حدث خطأ — تأكد من صلاحيات البوت.', ephemeral: true });
        }
      }

      // ── Music player buttons ────────────────────────────────────────
      if (id.startsWith('music_')) {
        const { checkCooldown } = await import('../utils/cooldown.js');

        // music_add must show modal before any defer/reply
        if (id === 'music_add') {
          const modal = new ModalBuilder().setCustomId('modal_music_add').setTitle('إضافة مقطع للقائمة');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('track_query').setLabel('اسم الأغنية أو الرابط')
              .setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return interaction.showModal(modal);
        }

        const { buildNowPlayingEmbed, buildPlayerButtons, getElapsed } = await import('../handlers/music.js');
        const queue = interaction.client.musicQueues.get(interaction.guildId);

        if (!queue) return interaction.reply({ content: '❌ لا يوجد مشغّل نشط.', ephemeral: true });
        if (!interaction.member.voice.channel || interaction.member.voice.channelId !== queue.voiceChannelId) {
          return interaction.reply({ content: '❌ يجب أن تكون في نفس القناة الصوتية.', ephemeral: true });
        }

        const rem = checkCooldown(interaction.user.id, id);
        if (rem > 0) return interaction.reply({ content: `⏳ انتظر **${(rem / 1000).toFixed(1)}ث**.`, ephemeral: true });

        await interaction.deferUpdate();

        if (id === 'music_pause') {
          if (queue._paused) {
            queue.player.unpause(); queue._startTime = Date.now(); queue._paused = false;
          } else {
            queue._elapsedBefore = getElapsed(queue); queue.player.pause(); queue._paused = true;
          }
          if (queue.current) {
            await interaction.editReply({
              embeds:     [buildNowPlayingEmbed(queue, getElapsed(queue))],
              components: buildPlayerButtons(queue._paused, queue.loopMode),
            }).catch(() => {});
          }
          return;
        }

        if (id === 'music_skip') {
          queue.player.stop();
          return;
        }

        if (id === 'music_stop') {
          queue.tracks = []; queue.current = null; queue.loopMode = 'none';
          queue.player?.stop(true); queue.connection?.destroy();
          interaction.client.musicQueues.delete(interaction.guildId);
          return interaction.editReply({
            embeds: [new EmbedBuilder().setDescription('⏹️ تم إيقاف الموسيقى وتفريغ القائمة.').setColor(0xed4245)],
            components: [],
          }).catch(() => {});
        }

        if (id === 'music_loop') {
          const modes = ['none', 'track', 'queue'];
          queue.loopMode = modes[(modes.indexOf(queue.loopMode) + 1) % modes.length];
          if (queue.current) {
            await interaction.editReply({
              embeds:     [buildNowPlayingEmbed(queue, getElapsed(queue))],
              components: buildPlayerButtons(queue._paused, queue.loopMode),
            }).catch(() => {});
          }
          return;
        }
      }

      return;
    }

  } catch (error) {
    console.error('[Interaction Error]', error);
    try {
      const { errorEmbed } = await import('../utils/embeds.js');
      const embed = errorEmbed('حدث خطأ غير متوقع أثناء تنفيذ الأمر. حاول مرة أخرى.');
      const opts  = { embeds: [embed], flags: 64 };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(opts).catch(() => {});
      } else {
        await interaction.reply(opts).catch(() => {});
      }
    } catch {}
  }
}
