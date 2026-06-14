import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { CATEGORY_LABEL } from '../data/ticketTypes.js';

// ════════════════════════════════════════════════════════════════════════════
//  SYS — Color Palette  (Black / Red / White Theme)
// ════════════════════════════════════════════════════════════════════════════
export const Colors = {
  RED:     0xe74c3c,
  CRIMSON: 0xc0392b,
  BLOOD:   0x8b0000,
  DARK:    0x1a1a1a,
  CHARCOAL:0x2c2c2c,
  WHITE:   0xffffff,
  SUCCESS: 0xffffff,
  ERROR:   0xe74c3c,
  INFO:    0x1a1a1a,
  WARNING: 0xe67e22,
  MOD:     0xe74c3c,
  RAID:    0x8b0000,
  JOIN:    0x2ecc71,
  LEAVE:   0x636e72,
  EDIT:    0x2980b9,
  VOICE:   0x00cec9,
  ROLE:    0xe74c3c,
  BOTLOG:  0x1a1a1a,
};

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Color Palette
// ════════════════════════════════════════════════════════════════════════════
export const COLOR = {
  blue:   0x1a6fff,
  black:  0x0d0d0d,
  red:    0xe53935,
  white:  0xffffff,
  gold:   0xffd700,
  green:  0x00c853,
  orange: 0xff9800,
  purple: 0x7c4dff,
};

// ════════════════════════════════════════════════════════════════════════════
//  Shared helpers
// ════════════════════════════════════════════════════════════════════════════
export const EPHEMERAL = 64;

const FOOTER_ICON = 'https://cdn.discordapp.com/emojis/1176695614518677504.webp';

function footer(section = 'Guardian Bot') {
  return { text: `⚔️ FX9-SYS  •  ${section}` };
}

function safeSet(embed, desc) {
  const s = String(desc ?? '').trim();
  if (s.length > 0) embed.setDescription(s.slice(0, 4096));
  return embed;
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
  return safeSet(base(Colors.WHITE, 'إشعار').setTitle(`✅  ${title}`), desc);
}

export function sysErrorEmbed(title, desc) {
  return safeSet(base(Colors.RED, 'خطأ').setTitle(`❌  ${title}`), desc);
}

export function infoEmbed(title, desc) {
  return safeSet(base(Colors.DARK, 'معلومات').setTitle(`ℹ️  ${title}`), desc);
}

export function warnEmbed(title, desc) {
  return safeSet(base(Colors.WARNING, 'تحذير').setTitle(`⚠️  ${title}`), desc);
}

export function sysLogEmbed(title, desc, color = Colors.CHARCOAL, section = 'السجلات العامة') {
  return safeSet(base(color, section).setTitle(title), desc);
}

export function modEmbed(action, target, moderator, reason, extra = {}) {
  const embed = base(Colors.RED, 'سجلات الإشراف')
    .setTitle(`🔨  ${action}`)
    .addFields(
      {
        name: '👤  العضو المستهدف',
        value: `${target}\n${target?.id ? `\`\`\`${target.id}\`\`\`` : ''}`,
        inline: true,
      },
      { name: '🛡️  المشرف', value: `${moderator}`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '📋  السبب', value: `\`\`\`${(reason || 'لم يُذكر سبب').slice(0, 990)}\`\`\``, inline: false },
    );
  for (const [name, value] of Object.entries(extra)) {
    embed.addFields({ name, value: String(value).slice(0, 1024), inline: true });
  }
  return embed;
}

export function alertEmbed(title, desc) {
  const embed = base(Colors.BLOOD, 'نظام الحماية').setTitle(`🚨  ${title}`);
  if (desc) safeSet(embed, desc);
  return embed;
}

export function botLogEmbed(status, desc, color = Colors.DARK) {
  return safeSet(
    base(color, 'سجل البوت')
      .setTitle(status)
      .addFields({ name: '🕐  الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }),
    desc
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Compat aliases (SYS-style names that TICKET handlers may use)
// ════════════════════════════════════════════════════════════════════════════

const CATEGORY_COLOR = {
  technical:   COLOR.blue,
  complaint:   COLOR.red,
  partnership: COLOR.green,
  other:       COLOR.gold,
};

export function successEmbed(desc) {
  return new EmbedBuilder().setColor(COLOR.green).setTitle("✅ تم بنجاح").setDescription(desc).setTimestamp();
}

export function errorEmbed(desc) {
  return new EmbedBuilder().setColor(COLOR.red).setTitle("❌ خطأ").setDescription(desc).setTimestamp();
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Panel
// ════════════════════════════════════════════════════════════════════════════

export function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle("〉FX9 Ticket Tool🎫 — مـركـز الـدعم الـفني")
    .setDescription(
      [
        "### 〉مرحباً بك في واجهة التحكم ",
        "نحن هنا لضمان تقديم أفضل خدمة لك. يرجى اختيار القسم المناسب من القائمة بالأسفل لبدء المحادثة مع فريق العمل المختص.",
        "",
        "**◈ الأقسام المتاحة حالياً :**",
        "```",
        "🛠️ | الدعم التقني   • للمشاكل والأخطاء التقنية",
        "🚫 | البلاغات      • لتقديم الشكاوى الرسمية",
        "🤝 | الشراكات     • لعروض التعاون والاستضافة",
        "❓ | استفسارات عامة • لأي سؤال أو مساعدة أخرى",
        "```",
        "",
        "**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**",
        "### 〉إرشادات هامة",
        "> 💡 **وضوح الطلب:** يرجى كتابة تفاصيل مشكلتك فور فتح التذكرة لسرعة الرد.",
        "> ⏱️ **وقت الاستجابة:** يعمل فريقنا على الرد خلال مدة أقصاها **24 ساعة**.",
        "> 🔒 **الخصوصية:** محادثتك خاصة تماماً ولا يراها إلا المسؤولين.",
        "**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**",
        "",
        "**｢ اضغط على الزر المناسب بالأسفل لفتح تذكرة جديدة ｣**"
      ].join("\n")
    )
    .setFooter({ text: "FX9 Ticket Tool🎫 • نظام الدعم الفني حد" })
    .setTimestamp();
}

export function panelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .setPlaceholder("📋 اختر نوع طلبك لفتح تكت...")
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel("دعم فني").setDescription("مشاكل تقنية وأعطال").setValue("technical").setEmoji("🛠️"),
        new StringSelectMenuOptionBuilder().setLabel("شكاوى").setDescription("الإبلاغ عن تصرف أو مشكلة").setValue("complaint").setEmoji("🚫"),
        new StringSelectMenuOptionBuilder().setLabel("شراكات").setDescription("عروض تعاون وشراكة").setValue("partnership").setEmoji("🤝"),
        new StringSelectMenuOptionBuilder().setLabel("أخرى").setDescription("استفسارات لا تندرج في الأقسام أعلاه").setValue("other").setEmoji("❓")
      )
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Ticket embed + buttons
// ════════════════════════════════════════════════════════════════════════════

export function ticketEmbed(t, adminChannel = false) {
  const PRIORITY_LABEL = { high: "🔴 عالية", medium: "🟡 متوسطة", low: "🟢 منخفضة" };
  return new EmbedBuilder()
    .setColor(adminChannel ? COLOR.purple : (CATEGORY_COLOR[t.category] ?? COLOR.blue))
    .setTitle(adminChannel
      ? `🔐 [إداري] ${t.ticketId} — ${CATEGORY_LABEL[t.category] ?? t.category}`
      : `🎫 ${t.ticketId} — ${CATEGORY_LABEL[t.category] ?? t.category}`)
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        adminChannel
          ? "**⚠️ هذه القناة للإدارة فقط — اكتب ردك هنا وسيصل للعضو تلقائياً**"
          : "**✅ تم فتح تكتك — فريق الدعم سيتواصل معك قريباً**",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `**👤 العضو:** <@${t.userId}> \`(${t.username})\``,
        `**📂 القسم:** ${CATEGORY_LABEL[t.category] ?? t.category}`,
        `**🎯 الأولوية:** ${PRIORITY_LABEL[t.priority]}`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "**📌 العنوان:**",
        `> ${t.title}`,
        "",
        "**📝 الوصف:**",
        `> ${t.description}`,
        t.evidence ? `\n**🔗 الأدلة:**\n> ${t.evidence}` : "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ].filter(Boolean).join("\n")
    )
    .setFooter({ text: adminChannel ? "FX9 Support System • Admin View" : "FX9 Support System • User View" })
    .setTimestamp();
}

export function ticketButtons(claimed, claimedByUsername, adminMode = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(claimed ? `✅ ${claimedByUsername ?? "مستلم"}` : "📩 Claim")
      .setStyle(claimed ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(claimed),
    new ButtonBuilder().setCustomId("ticket_unclaim").setLabel("📤 Unclaim").setStyle(ButtonStyle.Secondary).setDisabled(!claimed),
    new ButtonBuilder().setCustomId("ticket_rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Close").setStyle(ButtonStyle.Danger)
  );
  const rows = [row1];
  if (adminMode) {
    const row2 = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket_quickreply")
        .setPlaceholder("📋 Quick Reply — اختر رداً سريعاً...")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("قيد المراجعة").setDescription("نراجع طلبك حالياً").setValue("reviewing").setEmoji("🔍"),
          new StringSelectMenuOptionBuilder().setLabel("طلب أدلة").setDescription("طلب صور أو أدلة إضافية").setValue("need_evidence").setEmoji("📸"),
          new StringSelectMenuOptionBuilder().setLabel("تم الحل").setDescription("تم حل المشكلة").setValue("resolved").setEmoji("✅"),
          new StringSelectMenuOptionBuilder().setLabel("يرجى التوضيح").setDescription("نحتاج توضيحاً إضافياً").setValue("clarify").setEmoji("❓"),
          new StringSelectMenuOptionBuilder().setLabel("شكراً للتواصل").setDescription("رسالة ترحيب وشكر").setValue("thanks").setEmoji("🙏"),
          new StringSelectMenuOptionBuilder().setLabel("سيتم التحويل").setDescription("تحويل الطلب لجهة أخرى").setValue("transfer").setEmoji("🔄"),
          new StringSelectMenuOptionBuilder().setLabel("مشكلة معروفة").setDescription("نعمل على حلها حالياً").setValue("known_issue").setEmoji("⚠️")
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
  return new EmbedBuilder()
    .setColor(COLOR.gold)
    .setTitle("⭐  كيف كانت تجربتك مع الدعم؟")
    .setDescription(
      [
        "```",
        "  شكراً لتواصلك مع FX9 Support  ",
        "```",
        adminUsername ? `\nالإداري الذي ساعدك: **${adminUsername}**` : "",
        "",
        "**قيّم تجربتك من ١ إلى ٥ نجوم:**",
        "",
        "> ⭐ — تجربة ضعيفة جداً",
        "> ⭐⭐ — تجربة ضعيفة",
        "> ⭐⭐⭐ — تجربة مقبولة",
        "> ⭐⭐⭐⭐ — تجربة جيدة",
        "> ⭐⭐⭐⭐⭐ — تجربة ممتازة",
        "",
        `> *رقم التكت: \`${ticketId}\`*`,
        "\n> 💙 تقييمك يساعدنا على تحسين جودة الخدمة.",
      ].filter(Boolean).join("\n")
    )
    .setFooter({ text: "FX9 Support System • Feedback" });
}

export function ratingButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rate_1_${ticketId}`).setLabel("⭐ 1").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rate_2_${ticketId}`).setLabel("⭐ 2").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rate_3_${ticketId}`).setLabel("⭐ 3").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rate_4_${ticketId}`).setLabel("⭐ 4").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rate_5_${ticketId}`).setLabel("⭐ 5").setStyle(ButtonStyle.Success)
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TICKET — Log / Misc
// ════════════════════════════════════════════════════════════════════════════

export function logEmbed(title, color, fields) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`📋 ${title}`)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ text: "FX9 Support System • Log" });
}

export function inactivityEmbed(ticketId) {
  return new EmbedBuilder()
    .setColor(COLOR.orange)
    .setTitle("⚠️ تحذير خمول التكت")
    .setDescription(
      [
        `**رقم التكت: \`${ticketId}\`**`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "⏰ لم يتم إرسال أي رسائل منذ **24 ساعة**.",
        "",
        "إذا لم يكن هناك نشاط خلال **12 ساعة إضافية** سيُغلق التكت تلقائياً.",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "> يرجى الرد إذا كنت لا تزال تحتاج للمساعدة.",
      ].join("\n")
    )
    .setFooter({ text: "FX9 Support System • Inactivity Warning" })
    .setTimestamp();
}

export function buildTicketLogEmbed(ticket) {
  const stars = ticket.rating ? "⭐".repeat(ticket.rating) : "لم يُقيّم";
  const embed = new EmbedBuilder()
    .setColor(
      ticket.status === "closed" ? COLOR.red :
      ticket.status === "claimed" ? COLOR.blue :
      COLOR.green
    )
    .setTitle(`🎫 ${ticket.ticketId} — ${CATEGORY_LABEL?.[ticket.category] ?? ticket.category ?? "تكت"}`)
    .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    .addFields(
      { name: "📌 الحالة", value: ticket.status === "closed" ? "🔒 مغلق" : ticket.status === "claimed" ? "📩 مستلم" : "🟢 مفتوح", inline: true },
      { name: "👤 العضو",  value: `<@${ticket.userId}>`, inline: true },
      { name: "📩 المستلم", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "—", inline: true },
      { name: "📅 فتح في", value: ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:f>` : "—", inline: true },
      { name: "📅 أغلق في", value: ticket.closedAt ? `<t:${Math.floor(ticket.closedAt / 1000)}:f>` : "—", inline: true },
      { name: "📌 العنوان", value: ticket.title ?? "—", inline: false },
    );

  if (ticket.ticketId) embed.setFooter({ text: `FX9 Support System • ${ticket.ticketId}` });
  embed.setTimestamp();

  if (ticket.rating) embed.addFields({ name: "⭐ التقييم", value: `${stars} (${ticket.rating}/5)`, inline: true });
  return embed;
}

export function ticketLogMenu(ticket) {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('عرض التفاصيل الكاملة')
      .setDescription(`جميع معلومات التكت ${ticket.ticketId}`)
      .setValue(`details||${ticket.ticketId}`)
      .setEmoji('📋'),
  ];

  if (ticket.channelId) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('فتح قناة العضو')
        .setDescription(`الذهاب إلى قناة التكت ${ticket.ticketId}`)
        .setValue(`user_channel||${ticket.ticketId}`)
        .setEmoji('📩'),
    );
  }

  if (ticket.adminChannelId) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('فتح قناة الإدارة')
        .setDescription(`الذهاب إلى قناة الإدارة للتكت ${ticket.ticketId}`)
        .setValue(`admin_channel||${ticket.ticketId}`)
        .setEmoji('🔐'),
    );
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_log_menu')
      .setPlaceholder('🔽 إجراءات التكت...')
      .addOptions(options),
  );
}
