import { PermissionsBitField } from 'discord.js';
import { getTicketById, getGuildConfig } from '../data/ticketDB.js';
import { notice, field, C, EPHEMERAL } from '../utils/embeds.js';
import { CATEGORY_LABEL } from '../data/ticketTypes.js';
import { formatDuration } from '../utils/parseDuration.js';

const STATUS = {
  open:    { emoji: '🟢', label: 'Open' },
  claimed: { emoji: '📩', label: 'Claimed' },
  closed:  { emoji: '🔒', label: 'Closed' },
};

export async function handleTicketLogMenu(client, interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const config = getGuildConfig(interaction.guildId);
  const isSupport = member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    || (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id));

  if (!isSupport) {
    return interaction.editReply({ content: '❌ You do not have permission to use this menu.' });
  }

  const [action, ticketId] = interaction.values[0].split('||');
  const ticket = getTicketById(ticketId);

  if (!ticket) return interaction.editReply({ content: `❌ Ticket \`${ticketId}\` does not exist.` });

  // ── details ──────────────────────────────────────────────────────────────
  if (action === 'details') {
    const status = STATUS[ticket.status] ?? STATUS.open;
    const stars  = ticket.rating ? '⭐'.repeat(ticket.rating) : 'Not rated';
    const duration = ticket.openedAt && ticket.closedAt
      ? formatDuration(ticket.closedAt - ticket.openedAt)
      : '—';

    const fields = [
      field('📂 Category', CATEGORY_LABEL?.[ticket.category] ?? ticket.category ?? '—'),
      field('📌 Status', `${status.emoji} ${status.label}`),
      field('👤 Member', `<@${ticket.userId}>`),
      field('📩 Claimed by', ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'),
      field('📅 Opened', ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:f>` : '—'),
      field('🔒 Closed', ticket.closedAt ? `<t:${Math.floor(ticket.closedAt / 1000)}:f>` : '—'),
      field('⏱ Duration', duration),
      field('📌 Summary', ticket.title ?? '—', false),
    ];

    if (ticket.description) fields.push(field('📝 Details', ticket.description.slice(0, 1024), false));
    if (ticket.evidence) fields.push(field('🔗 Evidence', ticket.evidence.slice(0, 1024), false));

    if (Array.isArray(ticket.extra)) {
      for (const item of ticket.extra) {
        fields.push(field(`⚙️ ${item.label}`, String(item.value ?? '').slice(0, 1024), false));
      }
    }

    if (ticket.rating) fields.push(field('⭐ Rating', `${stars} (${ticket.rating}/5)`));

    // A deleted channel still appears, struck through, so the gap is explained
    // rather than silently missing.
    if (ticket.channelId) {
      const exists = client.channels.cache.has(ticket.channelId);
      fields.push(field('📩 Member channel', exists ? `<#${ticket.channelId}>` : '*deleted*'));
    }
    if (ticket.adminChannelId) {
      const exists = client.channels.cache.has(ticket.adminChannelId);
      fields.push(field('🔐 Staff channel', exists ? `<#${ticket.adminChannelId}>` : '*deleted*'));
    }

    return interaction.editReply({
      embeds: [notice({
        title: `🎫 Ticket — ${ticketId}`,
        color: C.info,
        fields,
        footer: `Kratos System • ${ticketId}`,
        timestamp: true,
      })],
    });
  }

  // ── channel shortcuts ────────────────────────────────────────────────────
  // Both of these are one sentence, so they stay plain text.
  if (action === 'user_channel' || action === 'admin_channel') {
    const isUser = action === 'user_channel';
    const channelId = isUser ? ticket.channelId : ticket.adminChannelId;
    const label = isUser ? 'Member channel' : 'Staff channel';

    if (!channelId) {
      return interaction.editReply({ content: `❌ This ticket has no ${label.toLowerCase()} (\`${ticketId}\`).` });
    }

    if (!client.channels.cache.has(channelId)) {
      return interaction.editReply({ content: `❌ The ${label.toLowerCase()} has been deleted (\`${ticketId}\`).` });
    }

    return interaction.editReply({
      content: `${isUser ? '📩' : '🔐'} ${label}: <#${channelId}>`,
    });
  }

  return interaction.editReply({ content: '❌ Unknown action.' });
}