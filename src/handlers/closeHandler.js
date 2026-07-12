import { PermissionsBitField, EmbedBuilder } from "discord.js";
import {
  getTicket, saveTicket, getAdminStats, saveAdminStats,
  getGuildConfig, getTicketByAdminChannel, getTicketById,
} from "../data/ticketDB.js";
import { closeEmbed, ratingEmbed, ratingButtons } from "../utils/embeds.js";
import { sendOrUpdateTicketLog } from "../utils/ticketLogUtils.js";
import { formatDuration } from "../utils/parseDuration.js";

const AUTO_CLOSE_DELAY = 20 * 60 * 1000;
const closeTimers = new Map();

async function deleteChannels(client, ticket) {
  const userCh = client.channels.cache.get(ticket.channelId);
  await userCh?.delete().catch(() => null);
  if (ticket.adminChannelId) {
    const adminCh = client.channels.cache.get(ticket.adminChannelId);
    await adminCh?.delete().catch(() => null);
  }
  closeTimers.delete(ticket.ticketId);
}

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

  const isSelect = interaction.isStringSelectMenu?.() ?? false;
  if (isSelect) { await interaction.deferUpdate(); }
  else { await interaction.deferReply({ ephemeral: true }); }

  ticket.status   = "closed";
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.id;
  await saveTicket(ticket);

  if (ticket.claimedBy) {
    const stats = getAdminStats(ticket.claimedBy);
    stats.username = ticket.claimedByUsername ?? "Unknown";
    stats.closed   = (stats.closed ?? 0) + 1;
    await saveAdminStats(stats);
  }

  const closeMsg = closeEmbed(ticket, interaction.user.id);

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
    await userCh.send({ embeds: [closeMsg] });
    if (ratingInChannel) {
      await userCh.send({
        content: `<@${ticket.userId}> ⭐ **قيّم تجربتك** بالضغط على الأزرار أدناه — تُحذف القناة تلقائياً بعد **20 دقيقة**.`,
        ...ratingPayload,
      });
    }
  }

  if (ticket.adminChannelId) {
    const adminCh = client.channels.cache.get(ticket.adminChannelId);
    if (adminCh) await adminCh.send({ embeds: [closeMsg] });
  }

  await sendOrUpdateTicketLog(client, ticket);

  if (isSelect) { await interaction.followUp({ content: "✅ تم إغلاق التكت. القناة ستُحذف بعد التقييم أو خلال 20 دقيقة.", ephemeral: true }); }
  else { await interaction.editReply({ content: "✅ تم إغلاق التكت. القناة ستُحذف بعد التقييم أو خلال 20 دقيقة." }); }

  if (closeTimers.has(ticket.ticketId)) clearTimeout(closeTimers.get(ticket.ticketId));
  closeTimers.set(ticket.ticketId, setTimeout(() => deleteChannels(client, ticket), AUTO_CLOSE_DELAY));
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
  await saveTicket(ticket);

  if (ticket.claimedBy) {
    const stats = getAdminStats(ticket.claimedBy);
    stats.totalRating = (stats.totalRating ?? 0) + rating;
    stats.ratingCount = (stats.ratingCount ?? 0) + 1;
    await saveAdminStats(stats);
  }

  const stars     = "⭐".repeat(rating);
  const labels    = { 1: 'سيئة جداً', 2: 'سيئة', 3: 'مقبولة', 4: 'جيدة', 5: 'ممتازة' };
  const colors    = { 1: 0xef4444, 2: 0xf97316, 3: 0xf59e0b, 4: 0x22c55e, 5: 0x10b981 };
  const emojis    = { 1: '😞', 2: '😕', 3: '😐', 4: '😊', 5: '🤩' };
  const replyMsg  = [
    '```ansi',
    `\u001b[1;33m✦   شكراً لتقييمك   ✦`,
    '```',
    '',
    `${emojis[rating]} **تقييمك:** ${stars} (${rating}/5) — **${labels[rating]}**`,
    '',
    '> 💙 **رأيك يهمنا** — تقييمك سيساعدنا على تحسين الخدمة',
  ].join('\n');

  const replyEmbed = new EmbedBuilder()
    .setColor(colors[rating] ?? 0x22c55e)
    .setTitle('✅ تم استلام تقييمك')
    .setDescription(replyMsg)
    .setFooter({ text: '⚔️ FX9 • تقييم • شكراً لثقتك' });

  try {
    await interaction.update({ embeds: [replyEmbed], components: [] });
  } catch {
    try { await interaction.reply({ embeds: [replyEmbed], ephemeral: true }); } catch {}
  }

  try {
    await sendOrUpdateTicketLog(client, ticket);
  } catch {}

  if (closeTimers.has(ticket.ticketId)) clearTimeout(closeTimers.get(ticket.ticketId));
  await deleteChannels(client, ticket);
}


