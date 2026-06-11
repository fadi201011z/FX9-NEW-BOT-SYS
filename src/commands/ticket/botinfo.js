import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  version as djsVersion,
} from "discord.js";
import { getAllTickets, getAllAdminStats } from "../../data/ticketDB.js";
import { COLOR } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("botinfo")
  .setDescription("ℹ️ معلومات حول بوت FX9 Ticket System");

export async function execute(interaction) {
  await interaction.deferReply();

  const client = interaction.client;
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);

  const totalTickets = interaction.guildId
    ? getAllTickets(interaction.guildId).length
    : 0;
  const admins = getAllAdminStats().length;

  const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  const embed = new EmbedBuilder()
    .setColor(COLOR.blue)
    .setTitle("ℹ️ FX9 Ticket System — معلومات البوت")
    .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        "```",
        "  ███████╗██╗  ██╗ █████╗ ",
        "  ██╔════╝╚██╗██╔╝██╔══██╗",
        "  █████╗   ╚███╔╝ ╚██████║",
        "  ██╔══╝   ██╔██╗ ██╔══██║",
        "  ██║     ██╔╝ ██╗╚█████╔╝",
        "  ╚═╝     ╚═╝  ╚═╝ ╚════╝ ",
        "```",
        "> نظام تكتات متكامل مع دعم متعدد الرتب وقنوات الريلاي",
      ].join("\n")
    )
    .addFields(
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🤖 اسم البوت",       value: `**${client.user.tag}**`, inline: true },
      { name: "📌 الإصدار",           value: "**v2.0.0**", inline: true },
      { name: "📡 السيرفرات",         value: `**${client.guilds.cache.size}**`, inline: true },
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👨‍💻 مطور البوت",       value: "**FX9**", inline: true },
      { name: "🏷️ Framework",         value: `**discord.js v${djsVersion}**`, inline: true },
      { name: "🖥️ Runtime",           value: `**Node.js ${process.version}**`, inline: true },
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⏰ وقت التشغيل",      value: `**${h}س ${m}د ${s}ث**`, inline: true },
      { name: "💾 الذاكرة",           value: `**${memMB} MB**`, inline: true },
      { name: "🎫 التكتات",           value: `**${totalTickets}**`, inline: true },
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✨ المميزات",         value: [
        "🎫 نظام تكتات متكامل بـ 4 أقسام",
        "🔐 قنوات مزدوجة (نظام الريلاي)",
        "🛡️ دعم رتب متعددة",
        "⭐ نظام تقييم ذكي (DM / في القناة)",
        "📩 Claim / Unclaim / Quick Reply",
        "⏰ مراقبة الخمول التلقائي",
        "📊 إحصائيات وتقارير كاملة",
        "📢 نظام إعلانات متقدم",
        "⏰ تذكير الأعضاء بالرد",
      ].join("\n"), },
      { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔗 الأوامر",          value: "`/helpt` للمشرفين | `/botinfo` | `/ticket` | `/panel`" },
    )
    .setFooter({ text: `FX9 Ticket System v2 • طُلب بواسطة ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
