import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  PermissionsBitField, EmbedBuilder,
} from "discord.js";
import { COLOR } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("helpt")
  .setDescription("📖 دليل أوامر نظام التكتات FX9 — للإدارة فقط")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels);

export async function execute(interaction) {
  await interaction.reply({
    ephemeral: true,
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.blue)
        .setTitle("📖 FX9 Ticket System v2 — دليل الأوامر الكامل")
        .setDescription([
          "```",
          "  ███████╗██╗  ██╗ █████╗ ",
          "  ██╔════╝╚██╗██╔╝██╔══██╗",
          "  █████╗   ╚███╔╝ ╚██████║",
          "  ██╔══╝   ██╔██╗ ██╔══██║",
          "  ██║     ██╔╝ ██╗╚█████╔╝",
          "  ╚═╝     ╚═╝  ╚═╝ ╚════╝ ",
          "```",
          "> 🔐 الأوامر الإدارية تتطلب **Manage Channels** أو أعلى.",
          "> ⭐ **جديد:** `/remind` تذكير الأعضاء | `/botinfo` معلومات البوت",
        ].join("\n")),

      new EmbedBuilder().setColor(COLOR.blue).setTitle("⚙️ أوامر الإعداد")
        .setDescription([
          "`/configt setup` — 🚀 معالج الإعداد مع شريط التقدم",
          "`/configt panel_channel [قناة] [send_now]` — 📣 قناة البنل + إرساله فوراً",
          "`/configt ticket_category [فئة]` — 📁 فئة قنوات الأعضاء",
          "`/configt admin_category [فئة]` — 🔐 فئة قنوات الإدارة (الريلاي)",
          "`/configt support_role action:[أضف/أزل/اعرض/امسح] role:` — 🛡️ رتب الدعم المتعددة",
          "`/configt log_channel [قناة]` — 📋 قناة السجلات",
          "`/configt show` — 👁️ عرض كل الإعدادات",
          "`/configt reset` — ⚠️ مسح الإعدادات (**Administrator**)",
          "`/panel` — 📋 إرسال بنل التكتات في القناة الحالية",
        ].join("\n")),

      new EmbedBuilder().setColor(COLOR.purple).setTitle("🔐 نظام القنوات المزدوجة (الريلاي)")
        .setDescription([
          "**كيف يعمل؟**",
          "عند كل تكت يُنشأ **قناتان تلقائياً:**",
          "",
          "1️⃣ **قناة العضو** ← العضو يكتب هنا",
          "   └─ ردود الإداري تصل كـ **رسالة نصية** (`:🎫 [الرتبة] اسم:`)",
          "",
          "2️⃣ **قناة الإدارة** ← الإداري يكتب هنا",
          "   └─ رسائل العضو تصل كـ **رسالة نصية** (`👨🏻‍🤝‍👨🏻 اسم: نص`)",
          "   └─ رسالة الإداري **لا تُحذف** وتبقى للمرجعية",
          "   └─ يحتوي على Quick Reply و Claim/Close",
          "",
          "**⚙️ تفعيله:** `/configt admin_category category:[الفئة]`",
          "**❌ تعطيله:** `/configt admin_category disable:true`",
        ].join("\n")),

      new EmbedBuilder().setColor(COLOR.gold).setTitle("🎫 أوامر التكتات والأدوات")
        .setDescription([
          "`/ticket info` — معلومات التكت الحالي",
          "`/ticket list` — 📋 جميع التكتات المفتوحة",
          "`/ticket add [عضو]` — ➕ إضافة عضو",
          "`/ticket remove [عضو]` — ➖ إزالة عضو",
          "`/ticket transcript` — 📄 سجل المحادثة كملف نصي",
          "`/ticket priority [مستوى]` — 🎯 تغيير الأولوية",
          "`/remind [رسالة]` — ⏰ تذكير العضو بالرد على التكت",
          "",
          "**🔘 الأزرار — قناة الإدارة:**",
          "• **📩 Claim / 📤 Unclaim** — استلام أو إعادة التكت",
          "• **📋 Quick Reply** — 7 ردود سريعة (فريق الدعم فقط)",
          "• **✏️ Rename** — تغيير الاسم مع الحفاظ على رقم التكت",
          "• **🔒 Close** — إغلاق + DM تقييم (أو في القناة إن أُغلقت الخاصة)",
          "",
          "**⏰ نظام الخمول:**",
          "• 🟡 **24 ساعة** → تحذير | 🔴 **36 ساعة** → إغلاق تلقائي",
        ].join("\n")),

      new EmbedBuilder().setColor(COLOR.red).setTitle("⭐ التقييمات، الإحصائيات، الإعلانات")
        .setDescription([
          "`/ratings view [مشرف]` — تقييمات مشرف مع توزيع النجوم",
          "`/ratings leaderboard [top]` — 🏆 لوحة المتصدرين",
          "`/ratings history [limit]` — 📜 آخر التقييمات",
          "`/ratings reset [مشرف]` — مسح تقييمات (**Administrator**)",
          "`/stats` — 📊 إحصائيات شاملة مع توزيع الأقسام",
          "",
          "`/announce [عنوان] [نص]` — 📢 إعلان احترافي:",
          "  • 7 ألوان | 6 أنواع (إعلان/صيانة/تحديث/تحذير/حدث/قواعد)",
          "  • صورة كبيرة + Thumbnail + Footer مخصص",
          "  • منشن @everyone / @here / رتبة معينة",
          "  • تحكم في التوقيت وقناة الإرسال",
          "",
          "`/botinfo` — ℹ️ معلومات البوت والمطور والإحصائيات",
        ].join("\n"))
        .setFooter({ text: "FX9 Support System v2 • /helpt للإدارة فقط" })
        .setTimestamp(),
    ],
  });
}
