import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import {
  getAllOpenTickets, getAllTickets, getClosedTicketsCount,
  getAllAdminStats, getGuildConfig,
} from '../../data/ticketDB.js';
import { C, EPHEMERAL, field, notice } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setDescription('📊 Ticket system statistics')
  .setName('stats')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels);

export async function execute(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const guildId   = interaction.guildId;
  const config    = getGuildConfig(guildId);
  const open      = getAllOpenTickets(guildId);
  const all       = getAllTickets(guildId);
  const closed    = getClosedTicketsCount(guildId);
  const rated     = all.filter((t) => t.rating !== undefined);
  const avgRating = rated.length > 0
    ? rated.reduce((sum, t) => sum + (t.rating ?? 0), 0) / rated.length
    : 0;

  // Restrict to staff who handled a ticket in THIS guild. Admin stats carry no
  // guild column, so the raw list spans every server the bot is in.
  const staffHere = new Set(all.map((t) => t.claimedBy).filter(Boolean));
  const top5 = getAllAdminStats()
    .filter((s) => staffHere.has(s.adminId) && s.ratingCount > 0)
    .sort((a, b) => (b.totalRating / b.ratingCount) - (a.totalRating / a.ratingCount))
    .slice(0, 5);

  const byCategory = {};
  for (const t of all) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;

  const fields = [
    field('🟢 Open', `${open.length}`),
    field('📩 Claimed', `${open.filter((t) => t.status === 'claimed').length}`),
    field('🔒 Closed', `${closed}`),
    field('📁 Total', `${all.length}`),
    field('⭐ Average rating', rated.length > 0 ? `${avgRating.toFixed(1)}/5 (${rated.length})` : 'None yet'),
    field('🛡️ Support roles', `${config.supportRoleIds?.length ?? 0}`),
    field('🔐 Two-channel mode', config.adminCategoryId ? '✅ Enabled' : '❌ Disabled'),
    field('📂 By category', [
      `🛠️ Technical Support: **${byCategory.technical ?? 0}**`,
      `🚫 Report: **${byCategory.complaint ?? 0}**`,
      `🤝 Partnership: **${byCategory.partnership ?? 0}**`,
      `❓ Other: **${byCategory.other ?? 0}**`,
    ].join('\n'), false),
  ];

  if (top5.length > 0) {
    const medals = ['🥇', '🥈', '🥉', '`4.`', '`5.`'];
    fields.push(field('🏆 Highest-rated staff', top5
      .map((s, i) => `${medals[i]} <@${s.adminId}> — ⭐ **${(s.totalRating / s.ratingCount).toFixed(1)}**/5 · 🔒 ${s.closed ?? 0} closed`)
      .join('\n'), false));
  }

  await interaction.editReply({
    embeds: [notice({
      title: '📊 Ticket statistics',
      color: C.info,
      fields,
      footer: 'Kratos System • Statistics',
      timestamp: true,
    })],
  });
}