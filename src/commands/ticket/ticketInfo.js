import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { getAllTickets, getTicketById, getGuildConfig } from '../../data/ticketDB.js';
import { fail, notice, field, C } from '../../utils/embeds.js';
import { CATEGORY_LABEL } from '../../data/ticketTypes.js';

export const data = new SlashCommandBuilder()
  .setName('ticket-show')
  .setDescription('🎫 Look up a ticket by its number')
  .addStringOption((opt) =>
    opt.setName('ticket_id')
      .setDescription('Ticket number, e.g. KRS-0001 or 1')
      .setRequired(true)
      .setMaxLength(20));

const STATUS = {
  closed:  { emoji: '🔒', label: 'Closed' },
  claimed: { emoji: '📩', label: 'Claimed' },
  open:    { emoji: '🟢', label: 'Open' },
};

const statusOf = (t) => STATUS[t.status] ?? STATUS.open;

export async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply(fail('This command only works inside a server.'));
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const input  = interaction.options.getString('ticket_id').trim();
    const config = getGuildConfig(interaction.guildId);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isSupport = member.permissions.has(PermissionsBitField.Flags.ManageChannels)
      || (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id));

    if (!isSupport) return interaction.editReply(fail('You do not have permission to view tickets.'));

    const guildId = interaction.guildId;

    // 1. Exact match, scoped to this guild so a number from another server
    //    cannot be opened here.
    let ticket = getTicketById(input);
    if (ticket && ticket.guildId !== guildId) ticket = null;

    // 2. Otherwise search this guild's tickets: exact, then numeric part
    //    (so "1" finds "KRS-0001"), then a loose substring match.
    if (!ticket) {
      const all     = getAllTickets(guildId);
      const num     = input.replace(/[^0-9]/g, '');
      const needle  = input.toLowerCase();
      const matches = all.filter((t) => {
        if (t.ticketId === input) return true;
        if (num && (t.ticketId.endsWith(num) || t.ticketId.includes(`-${num}`))) return true;
        return t.ticketId.toLowerCase().includes(needle);
      });

      if (matches.length === 0) {
        return interaction.editReply(fail(`No ticket in this server matches \`${input}\`.`));
      }

      // More than one hit: show the shortlist rather than guessing.
      if (matches.length > 1) {
        const list = matches
          .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
          .slice(0, 10)
          .map((t) => `${statusOf(t).emoji} \`${t.ticketId}\` — ${t.title ?? 'No summary'} — <@${t.userId}>`)
          .join('\n');

        return interaction.editReply({
          embeds: [notice({
            title: `🔍 Search results for "${input}"`,
            description: `Found **${matches.length}** matching tickets:`,
            color: C.info,
            fields: [field('Matches', list, false)],
            footer: 'Kratos System • Tickets',
            timestamp: true,
          })],
        });
      }

      ticket = matches[0];
    }

    const fields = [
      field('Category', CATEGORY_LABEL?.[ticket.category] ?? ticket.category ?? '—'),
      field('Status', `${statusOf(ticket).emoji} ${statusOf(ticket).label}`),
      field('Member', `<@${ticket.userId}>`),
      field('Claimed by', ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'),
      field('Opened', ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:f>` : '—'),
      field('Closed', ticket.closedAt ? `<t:${Math.floor(ticket.closedAt / 1000)}:f>` : '—'),
      field('Summary', ticket.title ?? '—', false),
    ];

    // A deleted channel still shows, struck through, so the gap is explained.
    if (ticket.channelId) {
      const exists = interaction.client.channels.cache.has(ticket.channelId);
      fields.push(field('Member channel', exists ? `<#${ticket.channelId}>` : '*deleted*'));
    }
    if (ticket.adminChannelId) {
      const exists = interaction.client.channels.cache.has(ticket.adminChannelId);
      fields.push(field('Staff channel', exists ? `<#${ticket.adminChannelId}>` : '*deleted*'));
    }
    if (ticket.description) {
      fields.push(field('Details', ticket.description.slice(0, 1024), false));
    }
    if (Array.isArray(ticket.extra)) {
      for (const item of ticket.extra) {
        fields.push(field(item.label, String(item.value ?? '').slice(0, 1024), false));
      }
    }
    if (ticket.rating) {
      fields.push(field('⭐ Rating', `${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)`));
    }

    await interaction.editReply({
      embeds: [notice({
        title: `🎫 Ticket — ${ticket.ticketId}`,
        color: C.info,
        fields,
        footer: `Kratos System • ${ticket.ticketId}`,
        timestamp: true,
      })],
    });
  } catch (err) {
    console.error('[ticket-show]', err);
    await interaction.editReply(fail('Something went wrong while looking up that ticket.')).catch(() => {});
  }
}