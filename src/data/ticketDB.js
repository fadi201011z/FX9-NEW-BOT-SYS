import fs from "fs-extra";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "fx9_data.json");
const DEFAULT = { guilds: {}, tickets: {}, adminStats: {} };

export function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.ensureDirSync(path.dirname(DATA_FILE));
      fs.writeJsonSync(DATA_FILE, DEFAULT, { spaces: 2 });
      return structuredClone(DEFAULT);
    }
    const raw = fs.readJsonSync(DATA_FILE);
    for (const cfg of Object.values(raw.guilds)) {
      if (!cfg.supportRoleIds) {
        cfg.supportRoleIds = cfg.supportRoleId ? [cfg.supportRoleId] : [];
        delete cfg.supportRoleId;
      }
    }
    return raw;
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function saveData(data) {
  fs.ensureDirSync(path.dirname(DATA_FILE));
  fs.writeJsonSync(DATA_FILE, data, { spaces: 2 });
}

export function getGuildConfig(guildId) {
  const data = loadData();
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { guildId, supportRoleIds: [], ticketCounter: 0 };
    saveData(data);
  }
  if (!data.guilds[guildId].supportRoleIds) data.guilds[guildId].supportRoleIds = [];
  return data.guilds[guildId];
}

export function saveGuildConfig(config) {
  const data = loadData();
  data.guilds[config.guildId] = config;
  saveData(data);
}

export function hasSupport(member, config) {
  const MANAGE_CHANNELS = 16n;
  if (member.permissions.has(MANAGE_CHANNELS)) return true;
  return config.supportRoleIds.some((id) => member.roles.cache.has(id));
}

export function getTicket(channelId) {
  const data = loadData();
  return (
    Object.values(data.tickets).find((t) => t.channelId === channelId) ??
    null
  );
}

export function getTicketByAdminChannel(channelId) {
  const data = loadData();
  return Object.values(data.tickets).find((t) => t.adminChannelId === channelId) ?? null;
}

export function getTicketByUser(guildId, userId) {
  const data = loadData();
  return (
    Object.values(data.tickets).find(
      (t) => t.guildId === guildId && t.userId === userId && t.status !== "closed"
    ) ?? null
  );
}

export function saveTicket(ticket) {
  const data = loadData();
  data.tickets[ticket.ticketId] = ticket;
  saveData(data);
}

export function getAllOpenTickets(guildId) {
  return Object.values(loadData().tickets).filter(
    (t) => t.guildId === guildId && t.status !== "closed"
  );
}

export function getAllTickets(guildId) {
  return Object.values(loadData().tickets).filter((t) => t.guildId === guildId);
}

export function getClosedTicketsCount(guildId) {
  return Object.values(loadData().tickets).filter(
    (t) => t.guildId === guildId && t.status === "closed"
  ).length;
}

export function getAdminStats(adminId) {
  const data = loadData();
  if (!data.adminStats[adminId]) {
    data.adminStats[adminId] = { adminId, username: "", claimed: 0, closed: 0, totalRating: 0, ratingCount: 0 };
    saveData(data);
  }
  return data.adminStats[adminId];
}

export function saveAdminStats(stats) {
  const data = loadData();
  data.adminStats[stats.adminId] = stats;
  saveData(data);
}

export function getAllAdminStats() {
  return Object.values(loadData().adminStats);
}
