import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { CATEGORY_LABEL } from '../data/ticketTypes.js';
import { formatDuration } from './parseDuration.js';

// ════════════════════════════════════════════════════════════════════════════
//  PREMIUM Color Palette 2025
// ════════════════════════════════════════════════════════════════════════════

export const Colors = {
  RED:     0xef4444,
  CRIMSON: 0xdc2626,
  BLOOD:   0x991b1b,
  DARK:    0x0f172a,
  CHARCOAL:0x1e293b,
  WHITE:   0xf8fafc,
  SUCCESS: 0x22c55e,
  ERROR:   0xef4444,
  INFO:    0x3b82f6,
  WARNING: 0xf59e0b,
  MOD:     0xef4444,
  RAID:    0x991b1b,
  JOIN:    0x22c55e,
  LEAVE:   0x64748b,
  EDIT:    0x3b82f6,
  VOICE:   0x06b6d4,
  ROLE:    0xef4444,
  BOTLOG:  0x0f172a,
};

export const COLOR = {
  blue:   0x3b82f6,
  black:  0x0f172a,
  red:    0xef4444,
  white:  0xf8fafc,
  gold:   0xfbbf24,
  green:  0x22c55e,
  orange: 0xf97316,
  purple: 0x8b5cf6,
};

// ════════════════════════════════════════════════════════════════════════════
//  Premium helpers
// ════════════════════════════════════════════════════════════════════════════

export const EPHEMERAL = 64;

const R = '\u200b';

function footer(text = 'FX9-SYS') {
  return { text: `⚔️ ${text}` };
}

function base(color, section) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter(footer(section));
}

// ════════════════════════════════════════════════════════════════════════════
//  SYS — Utility Embeds
// ════════════════════════════════════════════════════════════════════════════

export function sysSuccessEmbed(title, desc) {
  const e = base(Colors.SUCCESS, 'FX9-SYS').setTitle(`✅ ${title}`);
  if (desc) e.setDescription(desc);
  return e;
}

export function sysErrorEmbed(title, desc) {
  const e = base(Colors.ERROR, 'FX9-SYS').setTitle(`❌ ${title}`);
  if (desc) e.setDescription(desc);
  return e;
}

export function infoEmbed(title, desc) {
  const e = base(Colors.INFO, 'FX9-SYS').setTitle(`ℹ️ ${title}`);
  if (desc) e.setDescription(desc);
  return e;
}

export function warnEmbed(title, desc) {
  const e = base(Colors.WARNING, 'FX9-SYS').setTitle(`⚠️ ${title}`);
  if (desc) e.setDescription(desc);
  return e;
}

export function sysLogEmbed(title, desc, color = Colors.CHARCOAL, section = 'السجلات العامة') {
  const e = base(color, section).setTitle(title);
  if (desc) e.setDescription(desc);
  return e;
}

export function modEmbed(action, target, moderator, reason, extra = {}) {
  const e = base(Colors.MOD, 'سجلات الإشراف')
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: '👤 العضو', value: `${target}\n\`${target?.id || ''}\``, inline: true },
      { name: '🛡️ المشرف', value: `${moderator}`, inline: true },
      { name: R, value: R, inline: true },
      { name: '📋 السبب', value: `\`\`\`${(reason || 'لم يُذكر').slice(0, 990)}\`\`\``, inline: false },
    );
  for (const [k, v] of Object.entries(extra)) e.addFields({ name: k, value: String(v).slice(0, 1024), inline: true });
  return e;
}

export function alertEmbed(title, desc) {
  const e = base(Colors.RAID, 'نظام الحماية').setTitle(`🚨 ${title}`);
  if (desc) e.setDescription(desc);
  return e;
}

export function botLogEmbed(status, desc, color = Colors.BOTLOG) {
  const e = base(color, 'سجل البوت').setTitle(status)
    .addFields({ name: '🕐 الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true });
  if (desc) e.setDescription(desc);
  return e;
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Color map
// ════════════════════════════════════════════════════════════════════════════

const CATEGORY_COLOR = {
  technical:   COLOR.blue,
  complaint:   COLOR.red,
  partnership: COLOR.green,
  other:       COLOR.gold,
};

export function successEmbed(desc) {
  return new EmbedBuilder()
    .setColor(COLOR.green)
    .setTitle('✅ تم بنجاح')
    .setDescription(desc)
    .setTimestamp()
    .setFooter(footer('FX9-SYS'));
}

export function errorEmbed(desc) {
  return new EmbedBuilder()
    .setColor(COLOR.red)
    .setTitle('❌ خطأ')
    .setDescription(desc)
    .setTimestamp()
    .setFooter(footer('FX9-SYS'));
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Premium Panel
// ════════════════════════════════════════════════════════════════════════════

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━';
const DIV2 = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('FX9 Ticket Tool • مركز الدعم')
    .setDescription([
      '### ✦ أهلاً بك في مركز الدعم',
      '> اختر القسم المناسب من القائمة أدناه',
      '',
      `${DIV}`,
      '```ansi',
      '\u001b[1;36m🛠️  \u001b[0m\u001b[1;37mالدعم التقني     \u001b[0m\u001b[1;30m│ مشاكل وأعطال',
      '\u001b[1;31m🚫  \u001b[0m\u001b[1;37mالبلاغات        \u001b[0m\u001b[1;30m│ شكاوى وتقارير',
      '\u001b[1;32m🤝  \u001b[0m\u001b[1;37mالشراكات        \u001b[0m\u001b[1;30m│ تعاون واستضافة',
      '\u001b[1;33m❓  \u001b[0m\u001b[1;37mاستفسارات عامة  \u001b[0m\u001b[1;30m│ أسئلة واستفسارات',
      '```',
      `${DIV}`,
      '',
      '### ⏱ وقت الاستجابة المتوقع',
      '> يصل إلى **24 ساعة** — فريقنا يعمل على مدار الساعة',
      '',
      `${DIV}`,
      '',
      '>>> 🔒 **محادثتك خاصة** ولا يراها إلا المسؤولون المخولون',
      '💡 **يرجى كتابة تفاصيل واضحة** ليسهل علينا مساعدتك',
    ].join('\n'))
    .setFooter(footer('FX9 • مركز الدعم'))
    .setTimestamp();
}

export function panelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_category')
      .setPlaceholder('📋 اختر نوع الطلب لفتح تذكرة...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('الدعم التقني').setDescription('مشاكل تقنية وأعطال')
          .setValue('technical').setEmoji('🛠️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('البلاغات').setDescription('الإبلاغ عن تصرف أو مشكلة')
          .setValue('complaint').setEmoji('🚫'),
        new StringSelectMenuOptionBuilder()
          .setLabel('الشراكات').setDescription('عروض تعاون وشراكة')
          .setValue('partnership').setEmoji('🤝'),
        new StringSelectMenuOptionBuilder()
          .setLabel('أخرى').setDescription('استفسارات لا تندرج بالأقسام أعلاه')
          .setValue('other').setEmoji('❓'),
      )
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Premium Ticket Embed + Action Buttons
// ════════════════════════════════════════════════════════════════════════════

const PRIORITY_LABEL = { high: '🔴 عالية', medium: '🟡 متوسطة', low: '🟢 منخفضة' };

export function ticketEmbed(t, adminChannel = false) {
  const color = adminChannel ? COLOR.purple : (CATEGORY_COLOR[t.category] ?? COLOR.blue);
  const label = CATEGORY_LABEL[t.category] ?? t.category;

  const statusLine = adminChannel
    ? '```ansi\n\u001b[1;35m⚠️  قناة إدارة  │  الرد هنا يصل للعضو تلقائياً\u001b[0m\n```'
    : '```ansi\n\u001b[1;32m✅  تم الفتح    │  فريق الدعم سيتواصل معك\u001b[0m\n```';

  const desc = [
    `${DIV}`,
    statusLine,
    `${DIV}`,
    '',
    `**👤 العضو**  ─  <@${t.userId}> ${t.username ?? ''}`,
    `**📂 القسم**  ─  ${label}`,
    `**🎯 الأولوية**  ─  ${PRIORITY_LABEL[t.priority]}`,
    `**🆔 التذكرة**  ─  ${t.ticketId}`,
    '',
    `${DIV}`,
    '',
    `**📌 العنوان**`,
    `> ${t.title}`,
    '',
    `**📝 الوصف**`,
    `> ${t.description}`,
    t.evidence ? `\n**🔗 الأدلة**\n> ${t.evidence}` : '',
    '',
    `${DIV}`,
  ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(adminChannel ? `🔐 ${t.ticketId} — ${label}` : `🎫 ${t.ticketId} — ${label}`)
    .setDescription(desc)
    .setFooter(footer(adminChannel ? `FX9 • ${t.ticketId} • إدارة` : `FX9 • ${t.ticketId}`))
    .setTimestamp();
}

export function ticketButtons(claimed, claimedByUsername, adminMode = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_actions')
      .setPlaceholder('📋 اختر إجراء...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(claimed ? `✅ مستلم بواسطة ${claimedByUsername ?? '—'}` : '📩 استلام التكت')
          .setDescription(claimed ? 'تم استلام هذا التكت بالفعل' : 'استلام وتولي مسؤولية التكت')
          .setValue('claim')
          .setEmoji('📩'),
        new StringSelectMenuOptionBuilder()
          .setLabel('📤 إلغاء الاستلام')
          .setDescription('إعادة التكت للفريق')
          .setValue('unclaim')
          .setEmoji('📤'),
        new StringSelectMenuOptionBuilder()
          .setLabel('✏️ إعادة تسمية')
          .setDescription('تغيير اسم قناة التكت')
          .setValue('rename')
          .setEmoji('✏️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🔒 إغلاق التكت')
          .setDescription('إغلاق وحذف التكت بشكل نهائي')
          .setValue('close')
          .setEmoji('🔒'),
      )
  );

  const rows = [row1];

  if (adminMode) {
    const row2 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_quickreply')
        .setPlaceholder('📋 رد سريع — اختر رداً جاهزاً...')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('قيد المراجعة').setDescription('نراجع طلبك حالياً').setValue('reviewing').setEmoji('🔍'),
          new StringSelectMenuOptionBuilder().setLabel('طلب أدلة').setDescription('نحتاج صوراً أو أدلة إضافية').setValue('need_evidence').setEmoji('📸'),
          new StringSelectMenuOptionBuilder().setLabel('تم الحل').setDescription('تم حل المشكلة بنجاح').setValue('resolved').setEmoji('✅'),
          new StringSelectMenuOptionBuilder().setLabel('يرجى التوضيح').setDescription('نحتاج توضيحاً إضافياً').setValue('clarify').setEmoji('❓'),
          new StringSelectMenuOptionBuilder().setLabel('شكراً للتواصل').setDescription('رسالة شكر وترحيب').setValue('thanks').setEmoji('🙏'),
          new StringSelectMenuOptionBuilder().setLabel('سيتم التحويل').setDescription('تحويل الطلب للجهة المختصة').setValue('transfer').setEmoji('🔄'),
          new StringSelectMenuOptionBuilder().setLabel('مشكلة معروفة').setDescription('نعمل على حلها حالياً').setValue('known_issue').setEmoji('⚠️'),
        )
    );
    rows.push(row2);
  }

  return rows;
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Rating
// ════════════════════════════════════════════════════════════════════════════

export function ratingEmbed(ticketId, adminUsername) {
  const desc = [
    '```ansi',
    '\u001b[1;33m╔══════════════════════════════════╗',
    '\u001b[1;33m║    ✦  تقييم تجربة الدعم  ✦      ║',
    '\u001b[1;33m╚══════════════════════════════════╝',
    '```',
    '',
    `> ### 👋 شكراً لتواصلك مع ${adminUsername ? `**${adminUsername}**` : 'فريق الدعم'}`,
    '',
    `${DIV2}`,
    '',
    '### ✨ قيّم تجربتك',
    '> اختر التصنيف الذي يناسب مستوى الخدمة',
    '',
    '```ansi',
    '\u001b[1;31m 1️⃣  \u001b[0m\u001b[1;37mسيئة جداً  \u001b[0m\u001b[1;30m│ غير راضٍ تماماً عن الخدمة',
    '\u001b[1;31m 2️⃣  \u001b[0m\u001b[1;37mسيئة       \u001b[0m\u001b[1;30m│ الخدمة لم تلبي التوقعات',
    '\u001b[1;33m 3️⃣  \u001b[0m\u001b[1;37mمقبولة     \u001b[0m\u001b[1;30m│ خدمة متوسطة وتحتاج تحسين',
    '\u001b[1;32m 4️⃣  \u001b[0m\u001b[1;37mجيدة       \u001b[0m\u001b[1;30m│ خدمة جيدة ونلنا الرضا',
    '\u001b[1;32m 5️⃣  \u001b[0m\u001b[1;37mممتازة     \u001b[0m\u001b[1;30m│ خدمة استثنائية ورائعة',
    '```',
    '',
    `${DIV2}`,
    '',
    `> 📋 **التذكرة:** \`${ticketId}\``,
    '',
    `${DIV}`,
    '',
    '> 💙 **رأيك يهمنا** — تقييمك يساعدنا على تطوير الخدمة وتقديم الأفضل',
    '> ⏳ سيتم حذف القناة تلقائياً بعد التقييم',
  ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setAuthor({ name: 'FX9 • نظام التقييم', iconURL: 'https://cdn.discordapp.com/emojis/1100192159824027751.webp' })
    .setTitle('⭐ تقييم تجربة الدعم')
    .setDescription(desc)
    .setFooter(footer('FX9 • تقييم'))
    .setTimestamp();
}

export function ratingButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rate_1_${ticketId}`).setEmoji('1️⃣').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rate_2_${ticketId}`).setEmoji('2️⃣').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rate_3_${ticketId}`).setEmoji('3️⃣').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rate_4_${ticketId}`).setEmoji('4️⃣').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rate_5_${ticketId}`).setEmoji('5️⃣').setStyle(ButtonStyle.Success),
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Close Summary (used by closeHandler)
// ════════════════════════════════════════════════════════════════════════════

export function closeEmbed(ticket, closedBy) {
  const stars = ticket.rating ? '⭐'.repeat(ticket.rating) : 'لم يُقيّم';
  const desc = [
    `${DIV}`,
    `**🎫 التذكرة**  ─  ${ticket.ticketId}`,
    `**📂 القسم**  ─  ${CATEGORY_LABEL?.[ticket.category] ?? ticket.category ?? '—'}`,
    `${DIV}`,
    '',
    `**👤 فاتح التذكرة**  ─  <@${ticket.userId}> ${ticket.username ?? ''}`,
    `**📩 المستلم**  ─  ${ticket.claimedBy ? `<@${ticket.claimedBy}> ${ticket.claimedByUsername ?? ''}` : '❌ غير مستلم'}`,
    `**🔒 أغلقت بواسطة**  ─  <@${closedBy}>`,
    '',
    `${DIV}`,
    '',
    `**⏱ المدة**  ─  ${formatDuration(Date.now() - ticket.openedAt)}`,
    `**📅 فتحت**  ─  <t:${Math.floor(ticket.openedAt / 1000)}:f>`,
    `**📅 أغلقت**  ─  <t:${Math.floor(Date.now() / 1000)}:f>`,
    '',
    `${DIV}`,
    '',
    `**📌 العنوان**  ─  ${ticket.title ?? '—'}`,
    `**⭐ التقييم**  ─  ${stars}`,
    '',
    `${DIV}`,
    '',
    '> ⏳ **سيتم حذف القناة تلقائياً** بعد 20 دقيقة إن لم يتم التقييم',
    '> ✨ يمكنك التقييم الآن باستخدام الأزرار أدناه',
  ].join('\n');

  return new EmbedBuilder()
    .setColor(COLOR.red)
    .setTitle(`🔒 تم إغلاق التذكرة — ${ticket.ticketId}`)
    .setDescription(desc)
    .setFooter(footer(`FX9 • ${ticket.ticketId} • إغلاق`))
    .setTimestamp();
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Log & Inactivity
// ════════════════════════════════════════════════════════════════════════════

export function logEmbed(title, color, fields) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`📋 ${title}`)
    .addFields(fields)
    .setTimestamp()
    .setFooter(footer('FX9-SYS • سجل'));
}

export function inactivityEmbed(ticketId) {
  return new EmbedBuilder()
    .setColor(COLOR.orange)
    .setTitle('⚠️ تحذير عدم نشاط')
    .setDescription([
      `${DIV}`,
      `**🆔 التذكرة**  ─  ${ticketId}`,
      `${DIV}`,
      '',
      '> ⏰ **لم يتم إرسال أي رسائل منذ 24 ساعة**',
      '',
      'إذا لم يكن هناك رد خلال **12 ساعة** سيتم إغلاق التذكرة تلقائياً.',
      '',
      `${DIV}`,
      '',
      '> 💬 يرجى الرد إن كنت لا تزال بحاجة للمساعدة',
    ].join('\n'))
    .setFooter(footer('FX9 • تنبيه عدم نشاط'))
    .setTimestamp();
}

export function buildTicketLogEmbed(ticket) {
  const stars = ticket.rating ? '⭐'.repeat(ticket.rating) : 'لم يُقيّم';
  const statusEmoji = ticket.status === 'closed' ? '🔒' : ticket.status === 'claimed' ? '📩' : '🟢';
  const statusText = ticket.status === 'closed' ? 'مغلقة' : ticket.status === 'claimed' ? 'مستلمة' : 'مفتوحة';
  const e = new EmbedBuilder()
    .setColor(
      ticket.status === 'closed' ? COLOR.red
        : ticket.status === 'claimed' ? COLOR.blue
          : COLOR.green
    )
    .setTitle(`🎫 ${ticket.ticketId}  │  ${CATEGORY_LABEL?.[ticket.category] ?? ticket.category ?? 'تذكرة'}`)
    .setDescription(DIV)
    .addFields(
      { name: '📌 الحالة', value: `${statusEmoji} ${statusText}`, inline: true },
      { name: '👤 العضو', value: `<@${ticket.userId}>`, inline: true },
      { name: '📩 المستلم', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
      { name: '📅 فتحت', value: ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:f>` : '—', inline: true },
      { name: '📅 أغلقت', value: ticket.closedAt ? `<t:${Math.floor(ticket.closedAt / 1000)}:f>` : '—', inline: true },
      { name: '📌 العنوان', value: ticket.title ?? '—', inline: false },
    );

  if (ticket.rating) e.addFields({ name: '⭐ التقييم', value: `${stars} (${ticket.rating}/5)`, inline: true });

  return e
    .setFooter(footer(`FX9 • ${ticket.ticketId}`))
    .setTimestamp();
}

export function ticketLogMenu(ticket) {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('التفاصيل الكاملة')
      .setDescription(`جميع معلومات التذكرة ${ticket.ticketId}`)
      .setValue(`details||${ticket.ticketId}`)
      .setEmoji('📋'),
  ];

  if (ticket.channelId) options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('قناة العضو')
      .setDescription(`الذهاب لقناة التذكرة ${ticket.ticketId}`)
      .setValue(`user_channel||${ticket.ticketId}`)
      .setEmoji('📩'),
  );

  if (ticket.adminChannelId) options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('قناة الإدارة')
      .setDescription(`الذهاب لقناة الإدارة ${ticket.ticketId}`)
      .setValue(`admin_channel||${ticket.ticketId}`)
      .setEmoji('🔐'),
  );

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_log_menu')
      .setPlaceholder('🔽 إجراءات التذكرة...')
      .addOptions(options),
  );
}
