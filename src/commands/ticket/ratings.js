import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { getAllAdminStats, getAdminStats, saveAdminStats, getAllTickets } from '../../data/ticketDB.js';
import { ok, fail, notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ratings')
  .setDescription('⭐ Review and manage staff ratings')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
  .addSubcommand((s) =>
    s.setName('view').setDescription('Show ratings for one staff member, or everyone')
      .addUserOption((o) => o.setName('admin').setDescription('Staff member (omit for everyone)').setRequired(false)))
  .addSubcommand((s) =>
    s.setName('leaderboard').setDescription('🏆 Highest-rated staff')
      .addIntegerOption((o) => o.setName('top').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25).setRequired(false)))
  .addSubcommand((s) =>
    s.setName('history').setDescription('📜 Most recent ratings')
      .addIntegerOption((o) => o.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25).setRequired(false)))
  .addSubcommand((s) =>
    s.setName('reset').setDescription('🔄 Reset a staff member’s ratings — requires Administrator')
      .addUserOption((o) => o.setName('admin').setDescription('Staff member').setRequired(true)));

/**
 * Admin stats are stored per adminId, with no guild column — so the raw map
 * holds staff from every server this bot is in. Restrict it to people who
 * actually handled a ticket here, otherwise /ratings in one server leaks the
 * staff list of another.
 */
function statsForGuild(guildId) {
  const staffHere = new Set(
    getAllTickets(guildId)
      .map((t) => t.claimedBy)
      .filter(Boolean),
  );
  return getAllAdminStats().filter((s) => staffHere.has(s.adminId));
}

const average = (s) => (s.ratingCount > 0 ? s.totalRating / s.ratingCount : 0);
const stars = (value) => (value > 0 ? '⭐'.repeat(Math.round(value)) : '—');

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === 'view') {
    const user = interaction.options.getUser('admin');
    return user ? viewOne(interaction, user, guildId) : viewAll(interaction, guildId);
  }

  // ── leaderboard ─────────────────────────────────────────────────────────
  if (sub === 'leaderboard') {
    const top  = interaction.options.getInteger('top') ?? 10;
    const list = statsForGuild(guildId)
      .filter((s) => s.ratingCount > 0)
      .sort((a, b) => average(b) - average(a))
      .slice(0, top);

    if (list.length === 0) return interaction.editReply({ content: '❌ No ratings recorded yet.' });

    const medals = ['🥇', '🥈', '🥉'];
    const rows = list.map((s, i) => {
      const rank = medals[i] ?? `\`${i + 1}.\``;
      return `${rank} <@${s.adminId}> — ⭐ **${average(s).toFixed(2)}/5** ${stars(average(s))}\n`
        + `> 📊 ${s.ratingCount} rating${s.ratingCount === 1 ? '' : 's'} · 🔒 ${s.closed ?? 0} closed`;
    });

    return interaction.editReply({
      embeds: [notice({
        title: `🏆 Leaderboard — top ${top}`,
        color: C.gold,
        fields: [field('Staff', rows.join('\n\n'), false)],
        footer: 'Kratos System • Ratings',
        timestamp: true,
      })],
    });
  }

  // ── history ─────────────────────────────────────────────────────────────
  if (sub === 'history') {
    const limit = interaction.options.getInteger('limit') ?? 10;
    const tickets = getAllTickets(guildId)
      .filter((t) => t.rating !== undefined && t.closedAt)
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
      .slice(0, limit);

    if (tickets.length === 0) return interaction.editReply({ content: '❌ No ratings recorded yet.' });

    const rows = tickets.map((t) => {
      const handled = t.claimedBy ? `<@${t.claimedBy}>` : 'unclaimed';
      const when    = t.closedAt ? `<t:${Math.floor(t.closedAt / 1000)}:R>` : '—';
      return `\`${t.ticketId}\` ${'⭐'.repeat(t.rating ?? 0)} — ${handled} ${when}`;
    });

    return interaction.editReply({
      embeds: [notice({
        title: `📜 Last ${limit} ratings`,
        color: C.info,
        fields: [field('History', rows.join('\n'), false)],
        footer: 'Kratos System • Ratings',
        timestamp: true,
      })],
    });
  }

  // ── reset ───────────────────────────────────────────────────────────────
  if (sub === 'reset') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply(fail('This requires the **Administrator** permission.'));
    }

    const user  = interaction.options.getUser('admin', true);
    const stats = getAdminStats(user.id);
    stats.totalRating = 0;
    stats.ratingCount = 0;
    await saveAdminStats(stats);

    return interaction.editReply(ok(`Ratings for ${user.tag} have been reset.`));
  }
}

// ── Sub-views ──────────────────────────────────────────────────────────────

async function viewOne(interaction, user, guildId) {
  const stats = getAdminStats(user.id);
  const all   = getAllTickets(guildId).filter((t) => t.claimedBy === user.id);
  const rated = all.filter((t) => t.rating !== undefined);
  const avg   = stats.ratingCount > 0 ? (stats.totalRating / stats.ratingCount) : 0;

  // A five-bar histogram, which is more readable than five raw counts.
  const distribution = [5, 4, 3, 2, 1].map((n) => {
    const count = rated.filter((t) => t.rating === n).length;
    return `${'⭐'.repeat(n)} ${'█'.repeat(count)}${'░'.repeat(Math.max(0, 5 - count))} (${count})`;
  }).join('\n');

  await interaction.editReply({
    embeds: [notice({
      title: `📊 Ratings — ${user.username}`,
      color: C.info,
      thumbnail: user.displayAvatarURL({ size: 512 }),
      fields: [
        field('Average', stats.ratingCount > 0 ? `**${avg.toFixed(2)}/5** ${stars(avg)}` : '—'),
        field('Ratings', `${stats.ratingCount}`),
        field('Tickets handled', `${all.length}`),
        field('Claimed', `${stats.claimed ?? 0}`),
        field('Closed', `${stats.closed ?? 0}`),
        field('Close rate', stats.claimed > 0
          ? `${Math.round(((stats.closed ?? 0) / stats.claimed) * 100)}%`
          : '—'),
        field('Star distribution', `\`\`\`\n${distribution}\n\`\`\``, false),
      ],
      footer: 'Kratos System • Ratings',
      timestamp: true,
    })],
  });
}

async function viewAll(interaction, guildId) {
  const list = statsForGuild(guildId)
    .filter((s) => (s.claimed ?? 0) > 0 || (s.closed ?? 0) > 0)
    .sort((a, b) => (b.closed ?? 0) - (a.closed ?? 0));

  if (list.length === 0) return interaction.editReply({ content: '❌ No staff activity recorded yet.' });

  const medals = ['🥇', '🥈', '🥉'];
  const rows = list.map((s, i) => {
    const rank = medals[i] ?? `\`${i + 1}.\``;
    const avg  = s.ratingCount > 0 ? average(s).toFixed(1) : '—';
    return `${rank} <@${s.adminId}> — ⭐ **${avg}**/5 · 📩 ${s.claimed ?? 0} claimed · 🔒 ${s.closed ?? 0} closed`;
  });

  await interaction.editReply({
    embeds: [notice({
      title: '👥 All staff ratings',
      color: C.info,
      fields: [field('Staff', rows.join('\n'), false)],
      footer: `Kratos System • ${list.length} staff`,
      timestamp: true,
    })],
  });
}