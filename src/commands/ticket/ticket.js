import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  PermissionsBitField, EmbedBuilder, TextChannel,
} from "discord.js";
import { getTicket, saveTicket, getGuildConfig, getAllOpenTickets } from "../../data/ticketDB.js";
import { logEmbed, COLOR } from "../../utils/embeds.js";
import { CATEGORY_LABEL, PRIORITY_LABEL } from "../../data/ticketTypes.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("🎫 أدوات إدارة التكتات")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addSubcommand((s) => s.setName("info").setDescription("معلومات التكت الحالي"))
  .addSubcommand((s) =>
    s.setName("add").setDescription("إضافة عضو إلى التكت")
     .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName("remove").setDescription("إزالة عضو من التكت")
     .addUserOption((o) => o.setName("user").setDescription("العضو").setRequired(true))
  )
  .addSubcommand((s) => s.setName("transcript").setDescription("📄 سجل المحادثة كملف نصي"))
  .addSubcommand((s) => s.setName("list").setDescription("📋 جميع التكتات المفتوحة"))
  .addSubcommand((s) =>
    s.setName("priority").setDescription("🎯 تغيير الأولوية")
     .addStringOption((o) =>
       o.setName("level").setDescription("المستوى").setRequired(true)
        .addChoices({ name: "🔴 عالية", value: "high" }, { name: "🟡 متوسطة", value: "medium" }, { name: "🟢 منخفضة", value: "low" })
     )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "info") {
    await interaction.deferReply({ ephemeral: true });
    const t = getTicket(interaction.channelId);
    if (!t) { await interaction.editReply({ content: "❌ هذه القناة ليست تكتاً." }); return; }

    const elapsed = Date.now() - t.openedAt;
    const h = Math.floor(elapsed / 3600000);
    const m = Math.floor((elapsed % 3600000) / 60000);
    const statusMap = { open: "🟢 مفتوح", claimed: "📩 مستلم", closed: "🔒 مغلق" };

    const embed = new EmbedBuilder().setColor(COLOR.blue).setTitle(`📋 معلومات — ${t.ticketId}`)
      .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      .addFields(
        { name: "👤 العضو",       value: `<@${t.userId}>`, inline: true },
        { name: "📂 القسم",       value: CATEGORY_LABEL[t.category] ?? t.category, inline: true },
        { name: "📊 الحالة",      value: statusMap[t.status] ?? t.status, inline: true },
        { name: "🎯 الأولوية",   value: PRIORITY_LABEL[t.priority] ?? "🟡 متوسطة", inline: true },
        { name: "📩 الإداري",     value: t.claimedBy ? `<@${t.claimedBy}>` : "لا أحد", inline: true },
        { name: "⏰ مدة التكت",  value: `${h}س ${m}د`, inline: true },
        { name: "📌 العنوان",     value: t.title },
        { name: "📝 الوصف",       value: t.description },
        ...(t.evidence ? [{ name: "🔗 الأدلة", value: t.evidence }] : []),
      ).setFooter({ text: "FX9 • Ticket Info" }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });

  } else if (sub === "add") {
    await interaction.deferReply({ ephemeral: true });
    const t = getTicket(interaction.channelId);
    if (!t) { await interaction.editReply({ content: "❌ هذه القناة ليست تكتاً." }); return; }
    const user = interaction.options.getUser("user", true);
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    t.lastActivity = Date.now(); saveTicket(t);
    await interaction.channel.send({ embeds: [logEmbed("➕ تمت إضافة عضو", COLOR.green, [{ name: "العضو", value: `<@${user.id}>`, inline: true }, { name: "بواسطة", value: `<@${interaction.user.id}>`, inline: true }])] });
    await interaction.editReply({ content: `✅ تم إضافة <@${user.id}>.` });

  } else if (sub === "remove") {
    await interaction.deferReply({ ephemeral: true });
    const t = getTicket(interaction.channelId);
    if (!t) { await interaction.editReply({ content: "❌ هذه القناة ليست تكتاً." }); return; }
    const user = interaction.options.getUser("user", true);
    if (user.id === t.userId) { await interaction.editReply({ content: "❌ لا يمكن إزالة صاحب التكت." }); return; }
    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
    t.lastActivity = Date.now(); saveTicket(t);
    await interaction.channel.send({ embeds: [logEmbed("➖ تمت إزالة عضو", COLOR.red, [{ name: "العضو", value: `<@${user.id}>`, inline: true }, { name: "بواسطة", value: `<@${interaction.user.id}>`, inline: true }])] });
    await interaction.editReply({ content: `✅ تم إزالة <@${user.id}>.` });

  } else if (sub === "transcript") {
    await interaction.deferReply({ ephemeral: true });
    const t = getTicket(interaction.channelId);
    if (!t) { await interaction.editReply({ content: "❌ هذه القناة ليست تكتاً." }); return; }

    const msgs   = await interaction.channel.messages.fetch({ limit: 100 });
    const sorted = [...msgs.values()].reverse();
    const lines  = [
      `╔══════════════════════════════════════╗`,
      `║    FX9 Support — Ticket Transcript   ║`,
      `╚══════════════════════════════════════╝`,
      `رقم التكت : ${t.ticketId}`,
      `العضو     : ${t.username} (${t.userId})`,
      `القسم     : ${CATEGORY_LABEL[t.category] ?? t.category}`,
      `العنوان   : ${t.title}`,
      `فُتح في   : ${new Date(t.openedAt).toLocaleString("ar-SA")}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...sorted.map((m) => `[${new Date(m.createdTimestamp).toLocaleString("ar-SA")}] ${m.author.username}: ${m.content || (m.embeds.length ? "[Embed]" : "[Attachment]")}`),
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `FX9 Support System — ${new Date().toLocaleString("ar-SA")}`,
    ];
    const buf = Buffer.from(lines.join("\n"), "utf-8");

    const config = getGuildConfig(interaction.guildId);
    if (config.logChannelId) {
      const logCh = interaction.guild.channels.cache.get(config.logChannelId);
      await logCh?.send({ content: `📄 Transcript: \`${t.ticketId}\` — بواسطة <@${interaction.user.id}>`, files: [{ attachment: buf, name: `transcript-${t.ticketId}.txt` }] });
    }
    await interaction.editReply({ content: "✅ تم إنشاء الـ Transcript.", files: [{ attachment: buf, name: `transcript-${t.ticketId}.txt` }] });

  } else if (sub === "list") {
    await interaction.deferReply({ ephemeral: true });
    const open = getAllOpenTickets(interaction.guildId);
    if (!open.length) { await interaction.editReply({ content: "✅ لا توجد تكتات مفتوحة حالياً." }); return; }

    const catIcon = { technical: "🛠️", complaint: "🚫", partnership: "🤝", other: "❓" };
    const rows = open.map((t) => `${catIcon[t.category] ?? "📋"} \`${t.ticketId}\` <#${t.channelId}> — ${t.claimedBy ? `📩 <@${t.claimedBy}>` : "⏳ غير مستلم"}`);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.blue).setTitle(`📋 التكتات المفتوحة — ${open.length}`).setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" + rows.join("\n") + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━").setFooter({ text: "FX9 • Open Tickets" }).setTimestamp()] });

  } else if (sub === "priority") {
    await interaction.deferReply({ ephemeral: true });
    const t = getTicket(interaction.channelId);
    if (!t) { await interaction.editReply({ content: "❌ هذه القناة ليست تكتاً." }); return; }
    const level = interaction.options.getString("level", true);
    t.priority = level; t.lastActivity = Date.now(); saveTicket(t);
    const pColor = { high: COLOR.red, medium: COLOR.blue, low: COLOR.green };
    await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(pColor[level]).setTitle("🎯 تم تغيير الأولوية").setDescription(`الأولوية الجديدة: **${PRIORITY_LABEL[level]}**`).setFooter({ text: `بواسطة: ${interaction.user.username}` }).setTimestamp()] });
    await interaction.editReply({ content: `✅ الأولوية: **${PRIORITY_LABEL[level]}**` });
  }
}
