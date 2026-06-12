import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  PermissionsBitField, EmbedBuilder, User,
} from "discord.js";
import { getAllAdminStats, getAdminStats, saveAdminStats, getAllTickets } from "../../data/ticketDB.js";
import { COLOR } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("ratings")
  .setDescription("⭐ إدارة ومراقبة تقييمات المشرفين")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addSubcommand((s) =>
    s.setName("view").setDescription("عرض تقييمات مشرف أو الجميع")
     .addUserOption((o) => o.setName("admin").setDescription("المشرف (فارغ = الجميع)").setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName("leaderboard").setDescription("🏆 لوحة المتصدرين")
     .addIntegerOption((o) => o.setName("top").setDescription("عدد المشرفين (افتراضي 10)").setMinValue(1).setMaxValue(25).setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName("history").setDescription("📜 آخر التقييمات")
     .addIntegerOption((o) => o.setName("limit").setDescription("العدد (افتراضي 10)").setMinValue(1).setMaxValue(25).setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName("reset").setDescription("🔄 إعادة تعيين تقييمات مشرف — يتطلب Administrator")
     .addUserOption((o) => o.setName("admin").setDescription("المشرف").setRequired(true))
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === "view") {
    const user = interaction.options.getUser("admin");
    user ? await viewOne(interaction, user, guildId) : await viewAll(interaction, guildId);

  } else if (sub === "leaderboard") {
    const top = interaction.options.getInteger("top") ?? 10;
    const list = getAllAdminStats()
      .filter((s) => s.ratingCount > 0)
      .sort((a, b) => b.totalRating / b.ratingCount - a.totalRating / a.ratingCount)
      .slice(0, top);

    if (!list.length) { await interaction.editReply({ content: "❌ لا توجد تقييمات بعد." }); return; }

    const medals = ["🥇", "🥈", "🥉"];
    const rows = list.map((s, i) => {
      const avg   = (s.totalRating / s.ratingCount).toFixed(2);
      const stars = "⭐".repeat(Math.round(s.totalRating / s.ratingCount));
      return [`${medals[i] ?? `\`${i + 1}.\``} <@${s.adminId}>`, `> ⭐ **${avg}/5** ${stars}`, `> 📊 ${s.ratingCount} تقييم | 🔒 ${s.closed ?? 0} مغلق`].join("\n");
    });

    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.gold).setTitle(`🏆 لوحة المتصدرين — أفضل ${top}`).setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + rows.join("\n\n") + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━").setFooter({ text: "FX9 • Leaderboard" }).setTimestamp()] });

  } else if (sub === "history") {
    const limit = interaction.options.getInteger("limit") ?? 10;
    const tickets = getAllTickets(guildId).filter((t) => t.rating !== undefined && t.closedAt).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, limit);

    if (!tickets.length) { await interaction.editReply({ content: "❌ لا توجد تقييمات مسجّلة." }); return; }

    const rows = tickets.map((t) => {
      const stars = "⭐".repeat(t.rating ?? 0);
      const admin = t.claimedBy ? `<@${t.claimedBy}>` : "غير مستلم";
      const date  = t.closedAt ? `<t:${Math.floor(t.closedAt / 1000)}:R>` : "—";
      return `\`${t.ticketId}\` ${stars} — ${admin} ${date}`;
    });

    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.blue).setTitle(`📜 آخر ${limit} تقييمات`).setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + rows.join("\n") + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━").setFooter({ text: "FX9 • Rating History" }).setTimestamp()] });

  } else if (sub === "reset") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.editReply({ content: "❌ يلزم صلاحية **Administrator**." }); return;
    }
    const user = interaction.options.getUser("admin", true);
    const stats = getAdminStats(user.id);
    stats.totalRating = 0;
    stats.ratingCount = 0;
    saveAdminStats(stats);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.green).setTitle("✅ تم إعادة التعيين").setDescription(`تم مسح تقييمات <@${user.id}>.`).setFooter({ text: `بواسطة: ${interaction.user.username}` }).setTimestamp()] });
  }
}

async function viewOne(interaction, user, guildId) {
  const stats  = getAdminStats(user.id);
  const all    = getAllTickets(guildId).filter((t) => t.claimedBy === user.id);
  const rated  = all.filter((t) => t.rating !== undefined);
  const avg    = stats.ratingCount > 0 ? (stats.totalRating / stats.ratingCount).toFixed(2) : "—";
  const stars  = stats.ratingCount > 0 ? "⭐".repeat(Math.round(stats.totalRating / stats.ratingCount)) : "—";

  const dist = [1,2,3,4,5].map((n) => {
    const count = rated.filter((t) => t.rating === n).length;
    const bar   = "█".repeat(count) + "░".repeat(Math.max(0, 5 - count));
    return `${"⭐".repeat(n)} ${bar} (${count})`;
  });

  await interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(COLOR.blue).setTitle(`📊 تقييمات — ${user.username}`).setThumbnail(user.displayAvatarURL())
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "⭐ المتوسط",         value: `**${avg}/5** ${stars}`, inline: true },
        { name: "📊 عدد التقييمات",   value: `**${stats.ratingCount}**`, inline: true },
        { name: "🎫 تكتات معالجة",    value: `**${all.length}**`, inline: true },
        { name: "📩 Claimed",          value: `**${stats.claimed ?? 0}**`, inline: true },
        { name: "🔒 Closed",           value: `**${stats.closed ?? 0}**`, inline: true },
        { name: "📈 نسبة الإغلاق",    value: stats.claimed > 0 ? `**${Math.round(((stats.closed ?? 0) / stats.claimed) * 100)}%**` : "**—**", inline: true },
        { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📉 توزيع النجوم", value: dist.join("\n") }
      ).setFooter({ text: "FX9 • Admin Ratings" }).setTimestamp()
  ] });
}

async function viewAll(interaction, _guildId) {
  const list = getAllAdminStats().filter((s) => (s.claimed ?? 0) > 0 || (s.closed ?? 0) > 0).sort((a, b) => (b.closed ?? 0) - (a.closed ?? 0));
  if (!list.length) { await interaction.editReply({ content: "❌ لا توجد بيانات مشرفين بعد." }); return; }

  const medals = ["🥇", "🥈", "🥉"];
  const rows = list.map((s, i) => {
    const avg = s.ratingCount > 0 ? (s.totalRating / s.ratingCount).toFixed(1) : "—";
    return `${medals[i] ?? `\`${i + 1}.\``} <@${s.adminId}> — ⭐ **${avg}**/5 | 📩 ${s.claimed ?? 0} | 🔒 ${s.closed ?? 0}`;
  });

  await interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(COLOR.blue).setTitle("👥 تقييمات جميع المشرفين")
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + rows.join("\n") + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*📩 = Claimed | 🔒 = Closed*")
      .setFooter({ text: `FX9 • ${list.length} مشرف` }).setTimestamp()
  ] });
}
