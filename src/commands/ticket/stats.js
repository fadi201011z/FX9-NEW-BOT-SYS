import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  PermissionsBitField, EmbedBuilder,
} from "discord.js";
import { getAllOpenTickets, getAllTickets, getClosedTicketsCount, getAllAdminStats, getGuildConfig } from "../../data/ticketDB.js";
import { COLOR } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("stats")
  .setDescription("📊 .إحصائيات نظام التكتات FX9")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  const config  = getGuildConfig(guildId);
  const open    = getAllOpenTickets(guildId);
  const all     = getAllTickets(guildId);
  const closed  = getClosedTicketsCount(guildId);
  const rated   = all.filter((t) => t.rating !== undefined);
  const avgRating = rated.length > 0
    ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length
    : 0;

  const top5 = getAllAdminStats()
    .filter((s) => s.ratingCount > 0)
    .sort((a, b) => (b.totalRating / b.ratingCount) - (a.totalRating / a.ratingCount))
    .slice(0, 5);

  const catCount = { technical: 0, complaint: 0, partnership: 0, other: 0 };
  for (const t of all) catCount[t.category] = (catCount[t.category] ?? 0) + 1;

  const embed = new EmbedBuilder()
    .setColor(COLOR.blue)
    .setTitle("📊 إحصائيات FX9 Ticket System")
    .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    .addFields(
      { name: "🟢 مفتوحة",          value: `**${open.length}**`, inline: true },
      { name: "📩 Claimed",          value: `**${open.filter((t) => t.status === "claimed").length}**`, inline: true },
      { name: "🔒 مغلقة",           value: `**${closed}**`, inline: true },
      { name: "📁 الإجمالي",        value: `**${all.length}**`, inline: true },
      { name: "⭐ متوسط التقييم",   value: rated.length > 0 ? `**${avgRating.toFixed(1)}/5** (${rated.length})` : "لا يوجد", inline: true },
      { name: "🛡️ رتب الدعم",       value: `**${config.supportRoleIds.length}**`, inline: true },
      { name: "🔐 نظام الريلاي",    value: config.adminCategoryId ? "✅ مفعّل" : "❌ معطّل", inline: true },
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📂 توزيع الأقسام",
        value: [
          `🛠️ دعم فني: **${catCount.technical ?? 0}**`,
          `🚫 شكاوى: **${catCount.complaint ?? 0}**`,
          `🤝 شراكات: **${catCount.partnership ?? 0}**`,
          `❓ أخرى: **${catCount.other ?? 0}**`,
        ].join(" | "),
      },
    );

  if (top5.length > 0) {
    const medals = ["🥇", "🥈", "🥉", "`4.`", "`5.`"];
    embed.addFields({
      name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏆 أفضل المشرفين تقييماً",
      value: top5
        .map((s, i) => `${medals[i]} <@${s.adminId}> — ⭐ **${(s.totalRating / s.ratingCount).toFixed(1)}**/5 | 📩 ${s.claimed ?? 0} | 🔒 ${s.closed ?? 0}`)
        .join("\n"),
    });
  }

  embed.setFooter({ text: "FX9 Support System • Statistics" }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
