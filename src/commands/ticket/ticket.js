import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { getTicket, saveTicket, getGuildConfig, getAllOpenTickets } from '../../data/ticketDB.js';
import { C, EPHEMERAL, fail, field, logEntry, notice, ok } from '../../utils/embeds.js';
import { CATEGORY_LABEL, PRIORITY_LABEL, CATEGORY_EMOJI } from '../../data/ticketTypes.js';
import { formatDuration } from '../../utils/parseDuration.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('🎫 Manage tickets in this channel')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addSubcommand((s) => s.setName('info').setDescription('Show the current ticket’s details'))
  .addSubcommand((s) =>
    s.setName('add').setDescription('Give a member access to this ticket')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
  .addSubcommand((s) =>
    s.setName('remove').setDescription('Revoke a member’s access to this ticket')
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
  .addSubcommand((s) => s.setName('transcript').setDescription('📄 Save the conversation as a text file'))
  .addSubcommand((s) => s.setName('list').setDescription('📋 Every open ticket in this server'))
  .addSubcommand((s) =>
    s.setName('priority').setDescription('🎯 Change the ticket priority')
      .addStringOption((o) =>
        o.setName('level').setDescription('Level').setRequired(true)
          .addChoices(
            { name: '🔴 High', value: 'high' },
            { name: '🟡 Medium', value: 'medium' },
            { name: '🟢 Low', value: 'low' },
          )));

const NOT_A_TICKET = 'This channel is not a ticket.';
const STATUS_LABEL = { open: '🟢 Open', claimed: '📩 Claimed', closed: '🔒 Closed' };

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── info ────────────────────────────────────────────────────────────────
  // This earns its embed: the moderator is reading a record, not a result.
  if (sub === 'info') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const t = getTicket(interaction.channelId);
    if (!t) return interaction.editReply({ content: `❌ ${NOT_A_TICKET}` });

    const fields = [
      field('Member', `<@${t.userId}>`),
      field('Category', CATEGORY_LABEL[t.category] ?? t.category ?? '—'),
      field('Status', STATUS_LABEL[t.status] ?? t.status ?? '—'),
      field('Priority', PRIORITY_LABEL[t.priority] ?? t.priority ?? '—'),
      field('Claimed by', t.claimedBy ? `<@${t.claimedBy}>` : 'Nobody'),
      field('Age', formatDuration(Date.now() - t.openedAt)),
      field('Summary', (t.title ?? '—').slice(0, 1024), false),
      field('Details', (t.description ?? '—').slice(0, 1024), false),
    ];

    if (t.evidence) fields.push(field('Evidence', t.evidence.slice(0, 1024), false));
    if (Array.isArray(t.extra)) {
      for (const item of t.extra) fields.push(field(item.label, String(item.value).slice(0, 1024), false));
    }

    return interaction.editReply({
      embeds: [notice({
        title: `📋 Ticket — ${t.ticketId}`,
        color: C.info,
        fields,
        footer: `Kratos System • ${t.ticketId}`,
        timestamp: true,
      })],
    });
  }

  // ── add ─────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const t = getTicket(interaction.channelId);
    if (!t) return interaction.editReply({ content: `❌ ${NOT_A_TICKET}` });

    const user = interaction.options.getUser('user', true);
    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });

    t.lastActivity = Date.now();
    await saveTicket(t);

    // The channel is public, so this one is logged where staff will see it.
    await interaction.channel.send({
      embeds: [logEntry({
        kind: 'ticket_member_add',
        actor: `<@${interaction.user.id}>`,
        target: `<@${user.id}>`,
      })],
    });

    return interaction.editReply(ok(`<@${user.id}> can now see this ticket.`));
  }

  // ── remove ──────────────────────────────────────────────────────────────
  if (sub === 'remove') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const t = getTicket(interaction.channelId);
    if (!t) return interaction.editReply({ content: `❌ ${NOT_A_TICKET}` });

    const user = interaction.options.getUser('user', true);
    if (user.id === t.userId) {
      return interaction.editReply(fail('The member who opened the ticket cannot be removed.'));
    }

    await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });

    t.lastActivity = Date.now();
    await saveTicket(t);

    await interaction.channel.send({
      embeds: [logEntry({
        kind: 'ticket_member_remove',
        actor: `<@${interaction.user.id}>`,
        target: `<@${user.id}>`,
      })],
    });

    return interaction.editReply(ok(`<@${user.id}> can no longer see this ticket.`));
  }

  // ── transcript ──────────────────────────────────────────────────────────
  if (sub === 'transcript') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const t = getTicket(interaction.channelId);
    if (!t) return interaction.editReply({ content: `❌ ${NOT_A_TICKET}` });

    const msgs   = await interaction.channel.messages.fetch({ limit: 100 });
    const sorted = [...msgs.values()].reverse();
    const stamp  = (ts) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19);

    const lines = [
      '==================================================',
      '   Kratos System — Ticket Transcript',
      '==================================================',
      `Ticket   : ${t.ticketId}`,
      `Member   : ${t.username ?? 'unknown'} (${t.userId})`,
      `Category : ${CATEGORY_LABEL[t.category] ?? t.category ?? '—'}`,
      `Summary  : ${t.title ?? '—'}`,
      `Opened   : ${stamp(t.openedAt)}`,
      '--------------------------------------------------',
      ...sorted.map((m) => `[${stamp(m.createdTimestamp)}] ${m.author.username}: `
        + (m.content || (m.embeds.length ? '[embed]' : '[attachment]'))),
      '--------------------------------------------------',
      `Generated: ${stamp(Date.now())}`,
      '',
    ];

    const buf  = Buffer.from(lines.join('\n'), 'utf-8');
    const file = { attachment: buf, name: `transcript-${t.ticketId}.txt` };

    const config = getGuildConfig(interaction.guildId);
    if (config.logChannelId) {
      const logCh = interaction.guild.channels.cache.get(config.logChannelId);
      await logCh?.send({
        content: `📄 Transcript for \`${t.ticketId}\` · requested by <@${interaction.user.id}>`,
        files: [file],
      }).catch(() => {});
    }

    return interaction.editReply({ content: '✅ Transcript ready.', files: [file] });
  }

  // ── list ────────────────────────────────────────────────────────────────
  // A queue the moderator has to scan, so this is a table, not a sentence.
  if (sub === 'list') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const open = getAllOpenTickets(interaction.guildId);
    if (open.length === 0) {
      return interaction.editReply({ content: '✅ No open tickets right now.' });
    }

    const rows = open
      .slice(0, 20)
      .map((t) => `${CATEGORY_EMOJI[t.category] ?? '📋'} \`${t.ticketId}\` <#${t.channelId}> — `
        + (t.claimedBy ? `📩 <@${t.claimedBy}>` : '⏳ unclaimed'));

    return interaction.editReply({
      embeds: [notice({
        title: `📋 Open tickets — ${open.length}`,
        color: C.info,
        fields: [field('Queue', rows.join('\n'), false)],
        footer: open.length > 20 ? 'Kratos System • showing the first 20' : 'Kratos System',
        timestamp: true,
      })],
    });
  }

  // ── priority ────────────────────────────────────────────────────────────
  if (sub === 'priority') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const t = getTicket(interaction.channelId);
    if (!t) return interaction.editReply({ content: `❌ ${NOT_A_TICKET}` });

    const level = interaction.options.getString('level', true);
    t.priority = level;
    t.lastActivity = Date.now();
    await saveTicket(t);

    await interaction.channel.send({
      embeds: [logEntry({
        kind: 'ticket_priority',
        actor: `<@${interaction.user.id}>`,
        target: `<#${interaction.channelId}>`,
        color: { high: C.error, medium: C.info, low: C.ok }[level] ?? C.info,
        fields: [field('New priority', PRIORITY_LABEL[level] ?? level)],
      })],
    });

    return interaction.editReply(ok(`Priority set to **${PRIORITY_LABEL[level] ?? level}**.`));
  }
}