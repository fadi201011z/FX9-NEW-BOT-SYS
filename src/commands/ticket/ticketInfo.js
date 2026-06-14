import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } from "discord.js";
import { getAllTickets, getTicketById, getGuildConfig } from "../../data/ticketDB.js";
import { COLOR } from "../../utils/embeds.js";
import { CATEGORY_LABEL } from "../../data/ticketTypes.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-show")
  .setDescription("🎫 عرض معلومات تكت برقمه أو البحث عنه")
  .addStringOption((opt) =>
    opt.setName("ticket_id").setDescription("رقم التكت (مثل FX9-0001 أو 1)").setRequired(true).setMaxLength(20)
  );

export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ هذا الأمر يعمل فقط داخل السيرفر.", flags: 64 });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const input = interaction.options.getString("ticket_id").trim();
    const config = getGuildConfig(interaction.guildId);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isSupport =
      member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
      config.supportRoleIds.some((id) => member.roles.cache.has(id));
    if (!isSupport) {
      await interaction.editReply({ content: "❌ ليس لديك صلاحية." });
      return;
    }

    const guildId = interaction.guildId;

    // 1. Try exact match
    let ticket = getTicketById(input);
    if (ticket && ticket.guildId !== guildId) ticket = null;

    // 2. Try searching by numeric part (FX9-0001 → user types 1)
    if (!ticket) {
      const all = getAllTickets(guildId);
      const num = input.replace(/[^0-9]/g, "");
      const matches = all.filter((t) => {
        if (t.ticketId === input) return true;
        if (num && (t.ticketId.endsWith(num) || t.ticketId.includes(`-${num}`))) return true;
        return t.ticketId.toLowerCase().includes(input.toLowerCase());
      });

      if (matches.length === 0) {
        await interaction.editReply({ content: `❌ لا توجد تكتات تطابق \`${input}\` في هذا السيرفر.` });
        return;
      }

      if (matches.length > 1) {
        const list = matches
          .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
          .slice(0, 10)
          .map((t) => {
            const status = t.status === "closed" ? "🔒" : t.status === "claimed" ? "📩" : "🟢";
            return `\`${t.ticketId}\` ${status} — ${t.title ?? "بدون عنوان"} — <@${t.userId}>`;
          })
          .join("\n");
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR.blue)
              .setTitle(`🔍 نتائج البحث عن "${input}"`)
              .setDescription(`تم العثور على **${matches.length}** تكت:\n\n${list}`)
              .setTimestamp(),
          ],
        });
        return;
      }

      ticket = matches[0];
    }

    // Show ticket details
    const stars = ticket.rating ? "⭐".repeat(ticket.rating) : "لم يُقيّم";
    const embed = new EmbedBuilder()
      .setColor(COLOR.blue)
      .setTitle(`🎫 معلومات التكت — ${ticket.ticketId}`)
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "📂 القسم",     value: CATEGORY_LABEL?.[ticket.category] ?? ticket.category ?? "—", inline: true },
        { name: "📌 الحالة",    value: ticket.status === "closed" ? "🔒 مغلق" : ticket.status === "claimed" ? "📩 مستلم" : "🟢 مفتوح", inline: true },
        { name: "👤 العضو",     value: `<@${ticket.userId}>`, inline: true },
        { name: "📩 المستلم",   value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "غير مستلم", inline: true },
        { name: "📅 فتح في",    value: ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:f>` : "—", inline: true },
        { name: "🔒 أغلق في",   value: ticket.closedAt ? `<t:${Math.floor(ticket.closedAt / 1000)}:f>` : "—", inline: true },
        { name: "📌 العنوان",   value: ticket.title ?? "—", inline: false },
      );

    if (ticket.channelId) {
      const ch = interaction.client.channels.cache.get(ticket.channelId);
      embed.addFields({ name: "📩 قناة العضو", value: ch ? `<#${ticket.channelId}>` : "~~محذوفة~~", inline: true });
    }
    if (ticket.adminChannelId) {
      const ch = interaction.client.channels.cache.get(ticket.adminChannelId);
      embed.addFields({ name: "🔐 قناة الإدارة", value: ch ? `<#${ticket.adminChannelId}>` : "~~محذوفة~~", inline: true });
    }
    if (ticket.description) embed.addFields({ name: "📝 الوصف", value: ticket.description.slice(0, 1024), inline: false });
    if (ticket.rating) embed.addFields({ name: "⭐ التقييم", value: `${stars} (${ticket.rating}/5)`, inline: true });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[ticket-show]", err);
    await interaction.editReply({ content: "❌ حدث خطأ أثناء تنفيذ الأمر." }).catch(() => {});
  }
}
