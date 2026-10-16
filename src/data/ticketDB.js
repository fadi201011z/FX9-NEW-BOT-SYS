import Ticket from '../models/Ticket.js';
import TicketGuildConfig from '../models/TicketGuildConfig.js';
import AdminStats from '../models/AdminStats.js';

const ticketsByChannel = new Map();
const ticketsByAdminChannel = new Map();
const ticketsById = new Map();
const guildConfigs = new Map();
const adminStatsMap = new Map();

export function getTicket(channelId) {
  return ticketsByChannel.get(channelId) ?? null;
}

export function getTicketByAdminChannel(channelId) {
  return ticketsByAdminChannel.get(channelId) ?? null;
}

export function getTicketById(ticketId) {
  return ticketsById.get(ticketId) ?? null;
}

export function getTicketByUser(guildId, userId) {
  for (const t of ticketsById.values()) {
    if (t.guildId === guildId && t.userId === userId && t.status !== 'closed') return t;
  }
  return null;
}

function indexTicket(t) {
  if (t.channelId) ticketsByChannel.set(t.channelId, t);
  if (t.adminChannelId) ticketsByAdminChannel.set(t.adminChannelId, t);
  ticketsById.set(t.ticketId, t);
}

export function getGuildConfig(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, { guildId, supportRoleIds: [], ticketCounter: 0, sections: [] });
  }
  return guildConfigs.get(guildId);
}

/**
 * Persists the fields the bot owns. `sections` is deliberately absent: the bot
 * never edits it, and it is written from the dashboard between two of these
 * calls whenever an admin saves the editor — including `sections` here would
 * let a counter bump (a ticket opening) write a stale copy back over the
 * admin's save. Omitting it leaves the stored array untouched.
 */
export async function saveGuildConfig(config) {
  guildConfigs.set(config.guildId, config);
  try {
    await TicketGuildConfig.findOneAndUpdate(
      { guildId: config.guildId },
      {
        guildId: config.guildId,
        ticketCategoryId: config.ticketCategoryId ?? '',
        adminCategoryId: config.adminCategoryId ?? '',
        panelChannelId: config.panelChannelId ?? '',
        logChannelId: config.logChannelId ?? '',
        supportRoleIds: config.supportRoleIds ?? [],
        ticketCounter: config.ticketCounter ?? 0,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('[TicketDB] saveGuildConfig error:', err.message);
  }
}

/**
 * Re-reads one guild's config from the database into the in-memory map.
 *
 * The dashboard writes `sections` straight to Mongo, so the bot's copy goes
 * stale the moment an admin saves the editor. `/api/panels/refresh` (which the
 * dashboard calls right after that save) funnels through here, so the panel and
 * every modal opened afterwards are built from what was just saved.
 */
export async function reloadGuildConfig(guildId) {
  try {
    const row = await TicketGuildConfig.findOne({ guildId }).lean();
    if (!row) return getGuildConfig(guildId);
    const config = {
      guildId: row.guildId,
      ticketCategoryId: row.ticketCategoryId ?? '',
      adminCategoryId: row.adminCategoryId ?? '',
      panelChannelId: row.panelChannelId ?? '',
      logChannelId: row.logChannelId ?? '',
      supportRoleIds: row.supportRoleIds ?? [],
      ticketCounter: row.ticketCounter ?? 0,
      sections: row.sections ?? [],
    };
    guildConfigs.set(guildId, config);
    return config;
  } catch (err) {
    console.error('[TicketDB] reloadGuildConfig error:', err.message);
    return getGuildConfig(guildId);
  }
}

export async function saveTicket(ticket) {
  indexTicket(ticket);
  try {
    await Ticket.findOneAndUpdate(
      { ticketId: ticket.ticketId },
      ticket,
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('[TicketDB] saveTicket error:', err.message);
  }
}

export function getAllOpenTickets(guildId) {
  const result = [];
  for (const t of ticketsById.values()) {
    if (t.guildId === guildId && t.status !== 'closed') result.push(t);
  }
  return result;
}

export function getAllTickets(guildId) {
  const result = [];
  for (const t of ticketsById.values()) {
    if (t.guildId === guildId) result.push(t);
  }
  return result;
}

export function getClosedTicketsCount(guildId) {
  let count = 0;
  for (const t of ticketsById.values()) {
    if (t.guildId === guildId && t.status === 'closed') count++;
  }
  return count;
}

export function getAdminStats(adminId) {
  if (!adminStatsMap.has(adminId)) {
    adminStatsMap.set(adminId, { adminId, username: '', claimed: 0, closed: 0, totalRating: 0, ratingCount: 0 });
  }
  return adminStatsMap.get(adminId);
}

export async function saveAdminStats(stats) {
  adminStatsMap.set(stats.adminId, stats);
  try {
    await AdminStats.findOneAndUpdate(
      { adminId: stats.adminId },
      stats,
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('[TicketDB] saveAdminStats error:', err.message);
  }
}

export function getAllAdminStats() {
  return Array.from(adminStatsMap.values());
}

export async function loadAllData() {
  const guildRows = await TicketGuildConfig.find({}).lean();
  for (const row of guildRows) {
    guildConfigs.set(row.guildId, {
      guildId: row.guildId,
      ticketCategoryId: row.ticketCategoryId ?? '',
      adminCategoryId: row.adminCategoryId ?? '',
      panelChannelId: row.panelChannelId ?? '',
      logChannelId: row.logChannelId ?? '',
      supportRoleIds: row.supportRoleIds ?? [],
      ticketCounter: row.ticketCounter ?? 0,
      sections: row.sections ?? [],
    });
  }
  console.log(`[TicketDB] Loaded ${guildRows.length} guild configs`);

  const ticketRows = await Ticket.find({}).lean();
  for (const t of ticketRows) indexTicket(t);
  console.log(`[TicketDB] Loaded ${ticketRows.length} tickets`);

  const statsRows = await AdminStats.find({}).lean();
  for (const s of statsRows) adminStatsMap.set(s.adminId, s);
  console.log(`[TicketDB] Loaded ${statsRows.length} admin stats`);
}
