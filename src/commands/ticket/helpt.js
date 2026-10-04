import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('helpt')
  .setDescription('📖 Staff guide to the ticket system')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels);

export async function execute(interaction) {
  await interaction.reply({
    embeds: [notice({
      title: '📖 Ticket system — staff guide',
      description: 'Nine commands, in four groups. Every one of them requires '
        + '**Manage Channels** or a configured support role.',
      color: C.accent,
      fields: [
        field('Setup — once per server', [
          '`/configt setup` — guided wizard for the whole system.',
          '`/configt panel_channel` — where the panel is posted.',
          '`/configt ticket_category` — where member tickets are created.',
          '`/configt admin_category` — optional staff channel per ticket.',
          '`/configt support_role` — who counts as support.',
          '`/configt log_channel` — where closed tickets are archived.',
        ].join('\n'), false),
        field('Daily use', [
          '`/panel` — post the ticket panel.',
          '`/ticket info` — full details of the ticket in this channel.',
          '`/ticket add` · `/ticket remove` — control who can see it.',
          '`/ticket priority` — set high, medium or low.',
          '`/ticket transcript` — export the conversation as a text file.',
          '`/ticket list` — every open ticket in this server.',
          '`/remind` — nudge the member to reply.',
        ].join('\n'), false),
        field('Review', [
          '`/ratings view` — one staff member, or everyone.',
          '`/ratings leaderboard` — highest-rated staff.',
          '`/ratings history` — most recent ratings.',
          '`/ratings reset` — clear one staff member’s ratings (**Administrator**).',
          '`/stats` — open, claimed, closed and rating totals.',
          '`/ticket-show <id>` — find a ticket by number, e.g. `KRS-0001`.',
          '`/botinfo` — uptime and memory for this process.',
        ].join('\n'), false),
        field('How a ticket closes', [
          '1. A member presses **Close** on the close panel.',
          '2. They rate the staff member who helped, 1–5 stars.',
          '3. A copy is written to the archive channel and the channels are removed.',
          '4. Tickets with no reply close themselves after the inactivity timeout.',
        ].join('\n'), false),
      ],
      footer: 'Kratos System • Ticket system',
      timestamp: true,
    })],
    flags: 64,
  });
}