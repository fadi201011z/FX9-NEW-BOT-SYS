import { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } from "discord.js";
import { getTicketById, getGuildConfig } from "../../data/ticketDB.js";
import { COLOR } from "../../utils/embeds.js";
import { CATEGORY_LABEL } from "../../data/ticketTypes.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-info")
  .setDescription("🎫 عرض معلومات تكت برقمه")
  .addStringOption((opt) =>
    opt.setName("ticket_id").setDescription("رقم التكت (مثل TKT-001)").setRequired(true).setMaxLength(20)
  )
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const ticketId = interaction.options.getString("ticket_id");
  const ticket = getTicketById(ticketId);

  if (!ticket) {
    await interaction.editReply({ content: `❌ التكت \`${ticketId}\` غير موجود.` });
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isSupport =
    member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
    config.supportRoleIds.some((id) => member.roles.cache.has(id));
  if (!isSupport) {
    await interaction.editReply({ content: "❌ ليس لديك صلاحية." });
    return;
  }

  const stars = ticket.rating ? "⭐".repeat(ticket.rating) : "لم يُقيّم";
  const embed = new EmbedBuilder()
    .setColor(COLOR.blue)
    .setTitle(`🎫 معلومات التكت — ${ticketId}`)
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
}
