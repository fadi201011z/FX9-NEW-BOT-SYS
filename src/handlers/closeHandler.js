import { PermissionsBitField } from "discord.js";
import {
  getTicket, saveTicket, getAdminStats, saveAdminStats,
  getGuildConfig, getTicketByAdminChannel, getTicketById,
} from "../data/ticketDB.js";
import { logEmbed, ratingEmbed, ratingButtons, COLOR } from "../utils/embeds.js";

export async function handleCloseTicket(client, interaction) {
  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  if (!ticket) { await interaction.reply({ content: "❌ هذه القناة ليست تكتاً.", ephemeral: true }); return; }

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isAdmin =
    member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
    config.supportRoleIds.some((id) => member.roles.cache.has(id));

  if (!isAdmin && ticket.userId !== interaction.user.id) {
    await interaction.reply({ content: "❌ لا تملك صلاحية إغلاق هذا التكت.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  ticket.status   = "closed";
  ticket.closedAt = Date.now();
  saveTicket(ticket);

  if (ticket.claimedBy) {
    const stats = getAdminStats(ticket.claimedBy);
    stats.username = ticket.claimedByUsername ?? "Unknown";
    stats.closed   = (stats.closed ?? 0) + 1;
    saveAdminStats(stats);
  }

  const closeEmbed = logEmbed("🔒 تم إغلاق التكت", COLOR.red, [
    { name: "رقم التكت",    value: ticket.ticketId, inline: true },
    { name: "العضو",         value: `<@${ticket.userId}>`, inline: true },
    { name: "الإداري",       value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "غير مستلم", inline: true },
    { name: "مُغلق بواسطة", value: `<@${interaction.user.id}>`, inline: true },
    { name: "المدة",         value: formatDuration(Date.now() - ticket.openedAt), inline: true },
  ]);

  const ratingPayload = {
    embeds:     [ratingEmbed(ticket.ticketId, ticket.claimedByUsername)],
    components: [ratingButtons(ticket.ticketId)],
  };

  let ratingInChannel = false;
  try {
    const dmUser = await client.users.fetch(ticket.userId, { force: true });
    const dmChannel = await dmUser.createDM();
    await dmChannel.send(ratingPayload);
  } catch {
    ratingInChannel = true;
  }

  const userCh = client.channels.cache.get(ticket.channelId);
  if (userCh) {
    await userCh.send({ embeds: [closeEmbed] });
    if (ratingInChannel) {
      await userCh.send({
        content: `<@${ticket.userId}> ⭐ **قيّم تجربتك قبل إغلاق القناة** — ستُحذف بعد **30 ثانية**:`,
        ...ratingPayload,
      });
    }
  }

  if (ticket.adminChannelId) {
    const adminCh = client.channels.cache.get(ticket.adminChannelId);
    if (adminCh) await adminCh.send({ embeds: [closeEmbed] });
  }

  if (config.logChannelId) {
    const logCh = await client.channels.fetch(config.logChannelId).catch(() => null);
    await logCh?.send({ embeds: [closeEmbed] });
  }

  await interaction.editReply({ content: "✅ سيُغلق التكت خلال لحظات..." });

  const delay = ratingInChannel ? 30_000 : 8_000;
  setTimeout(async () => {
    await userCh?.delete().catch(() => null);
    if (ticket.adminChannelId) {
      const adminCh = client.channels.cache.get(ticket.adminChannelId);
      await adminCh?.delete().catch(() => null);
    }
  }, delay);
}

export async function handleRatingButton(client, interaction) {
  const parts    = interaction.customId.split("_");
  const rating   = parseInt(parts[1]);
  const ticketId = parts.slice(2).join("_");

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    try { await interaction.reply({ content: "❌ التكت غير موجود.", ephemeral: true }); } catch {}
    return;
  }
  if (ticket.rating !== undefined) {
    try { await interaction.reply({ content: "✅ لقد قيّمت هذا التكت مسبقاً، شكراً.", ephemeral: true }); } catch {}
    return;
  }

  ticket.rating  = rating;
  ticket.ratedBy = interaction.user.id;
  saveTicket(ticket);

  if (ticket.claimedBy) {
    const stats = getAdminStats(ticket.claimedBy);
    stats.totalRating = (stats.totalRating ?? 0) + rating;
    stats.ratingCount = (stats.ratingCount ?? 0) + 1;
    saveAdminStats(stats);
  }

  const stars   = "⭐".repeat(rating);
  const replyMsg = `✨ شكراً! أعطيت **${stars}** (${rating}/5) — تقييمك يساعدنا على تحسين الخدمة.`;

  try {
    await interaction.update({ content: replyMsg, embeds: [], components: [] });
  } catch {
    try { await interaction.reply({ content: replyMsg, ephemeral: true }); } catch {}
  }

  try {
    const config = getGuildConfig(ticket.guildId);
    if (config.logChannelId) {
      const guild = client.guilds.cache.get(ticket.guildId);
      const logCh = guild?.channels.cache.get(config.logChannelId);
      await logCh?.send({
        embeds: [logEmbed("⭐ تقييم جديد", COLOR.gold, [
          { name: "رقم التكت", value: ticket.ticketId, inline: true },
          { name: "التقييم",   value: `${stars} (${rating}/5)`, inline: true },
          { name: "العضو",     value: `<@${ticket.userId}>`, inline: true },
          { name: "الإداري",   value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "غير مستلم", inline: true },
        ])],
      });
    }
  } catch {}
}

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}س ${m}د`;
}
