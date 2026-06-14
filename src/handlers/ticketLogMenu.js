import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { getTicketById, getGuildConfig } from "../data/ticketDB.js";
import { COLOR } from "../utils/embeds.js";
import { CATEGORY_LABEL } from "../data/ticketTypes.js";

export async function handleTicketLogMenu(client, interaction) {
  await interaction.deferReply({ ephemeral: true });

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const config = getGuildConfig(interaction.guildId);
  const isSupport =
    member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
    config.supportRoleIds.some((id) => member.roles.cache.has(id));

  if (!isSupport) {
    await interaction.editReply({ content: "❌ ليس لديك صلاحية استخدام هذه القائمة." });
    return;
  }

  const [action, ticketId] = interaction.values[0].split("||");
  const ticket = getTicketById(ticketId);

  if (!ticket) {
    await interaction.editReply({ content: `❌ التكت \`${ticketId}\` غير موجود.` });
    return;
  }

  switch (action) {
    case "details": {
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
      if (ticket.description) embed.addFields({ name: "📝 الوصف", value: ticket.description.slice(0, 1024), inline: false });
      if (ticket.rating) embed.addFields({ name: "⭐ التقييم", value: `${stars} (${ticket.rating}/5)`, inline: true });
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case "user_channel": {
      if (ticket.channelId) {
        const ch = client.channels.cache.get(ticket.channelId);
        if (ch) {
          await interaction.editReply({ content: `📩 قناة العضو: <#${ticket.channelId}>` });
        } else {
          await interaction.editReply({ content: `❌ قناة العضو محذوفة (\`${ticketId}\`).` });
        }
      } else {
        await interaction.editReply({ content: `❌ لا توجد قناة عضو لهذا التكت (\`${ticketId}\`).` });
      }
      break;
    }

    case "admin_channel": {
      if (ticket.adminChannelId) {
        const ch = client.channels.cache.get(ticket.adminChannelId);
        if (ch) {
          await interaction.editReply({ content: `🔐 قناة الإدارة: <#${ticket.adminChannelId}>` });
        } else {
          await interaction.editReply({ content: `❌ قناة الإدارة محذوفة (\`${ticketId}\`).` });
        }
      } else {
        await interaction.editReply({ content: `❌ لا توجد قناة إدارة لهذا التكت (\`${ticketId}\`).` });
      }
      break;
    }

    default:
      await interaction.editReply({ content: "❌ إجراء غير معروف." });
  }
}
