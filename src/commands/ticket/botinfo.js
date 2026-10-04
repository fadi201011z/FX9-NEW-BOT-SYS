import { SlashCommandBuilder, version as djsVersion } from 'discord.js';
import { getAllTickets, getAllOpenTickets, getAllAdminStats } from '../../data/ticketDB.js';
import { notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('botinfo')
  .setDescription('ℹ️ Uptime, memory and ticket counts for this server');

const uptime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m ${s % 60}s`;
};

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const client  = interaction.client;
  const guildId = interaction.guildId;

  const total = guildId ? getAllTickets(guildId) : [];
  const open  = guildId ? getAllOpenTickets(guildId) : [];

  // Staff are counted from this guild's tickets only — admin stats carry no
  // guild column, so the raw list spans every server the bot is in.
  const staffHere = new Set(total.map((t) => t.claimedBy).filter(Boolean));
  const staff     = getAllAdminStats().filter((s) => staffHere.has(s.adminId));

  const rated = total.filter((t) => t.rating !== undefined);
  const avg   = rated.length
    ? (rated.reduce((sum, t) => sum + (t.rating ?? 0), 0) / rated.length).toFixed(2)
    : '—';

  await interaction.editReply({
    embeds: [notice({
      title: 'ℹ️ Ticket system — runtime status',
      color: C.info,
      thumbnail: client.user.displayAvatarURL({ size: 512 }),
      fields: [
        field('Uptime', uptime(process.uptime())),
        field('Memory', `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`),
        field('discord.js', `v${djsVersion}`),
        field('Node.js', process.version),
        field('Tickets — all', `${total.length}`),
        field('Tickets — open', `${open.length}`),
        field('Staff involved', `${staff.length}`),
        field('Average rating', avg === '—' ? '—' : `⭐ **${avg}/5** (${rated.length})`),
      ],
      footer: guildId ? `Kratos System • ${client.guilds.cache.get(guildId)?.name ?? 'this server'}` : 'Kratos System',
      timestamp: true,
    })],
  });
}