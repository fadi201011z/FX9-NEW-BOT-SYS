import GuildConfig from './models/GuildConfig.js';
import Warning from './models/Warning.js';
import AntiSpam from './models/AntiSpam.js';
import AntiNuke from './models/AntiNuke.js';
import CommandConfig from './models/CommandConfig.js';
import { connectDB } from './models/connection.js';

await connectDB();

const configCache = new Map();
const commandConfigs = new Map();
const warningCache = new Map();

function cfgKey(guildId, commandName) { return `${guildId}:${commandName}`; }
function warnKey(guildId, userId) { return `${guildId}:${userId}`; }

export function getConfig(guildId, key) {
  return configCache.get(`${guildId}:${key}`) ?? null;
}

export async function setConfig(guildId, key, value) {
  configCache.set(`${guildId}:${key}`, value);
  await GuildConfig.findOneAndUpdate(
    { guildId, key },
    { guildId, key, value },
    { upsert: true, new: true }
  );
}

export async function addWarning(guildId, userId, moderatorId, reason) {
  const key = warnKey(guildId, userId);
  if (!warningCache.has(key)) warningCache.set(key, []);
  const warning = { guildId, userId, moderatorId, reason, timestamp: Date.now() };
  warningCache.get(key).unshift(warning);
  Warning.create(warning).catch(() => {});
}

export function getWarnings(guildId, userId) {
  return warningCache.get(warnKey(guildId, userId)) || [];
}

export async function clearWarnings(guildId, userId) {
  warningCache.delete(warnKey(guildId, userId));
  await Warning.deleteMany({ guildId, userId });
}

export function getSpamData(guildId, userId) {
  return AntiSpam.findOne({ guildId, userId }).lean();
}

export function upsertSpamData(guildId, userId, count, lastReset) {
  return AntiSpam.findOneAndUpdate(
    { guildId, userId },
    { guildId, userId, messageCount: count, lastReset },
    { upsert: true, new: true }
  );
}

export function getNukeData(guildId, userId, action) {
  return AntiNuke.findOne({ guildId, userId, action }).lean();
}

export function upsertNukeData(guildId, userId, action, count, lastReset) {
  return AntiNuke.findOneAndUpdate(
    { guildId, userId, action },
    { guildId, userId, action, count, lastReset },
    { upsert: true, new: true }
  );
}

export { commandConfigs };

export function isCommandEnabled(guildId, commandName) {
  const key = cfgKey(guildId, commandName);
  if (commandConfigs.has(key)) return commandConfigs.get(key).enabled;
  return true;
}

export function canMemberUseCommand(guildId, commandName, memberRoles) {
  const key = cfgKey(guildId, commandName);
  const cfg = commandConfigs.get(key);
  if (!cfg) return true;
  const allowed = cfg.allowedRoles;
  const blocked = cfg.blockedRoles;
  if (allowed.length > 0 && memberRoles.some(r => allowed.includes(r))) return true;
  if (blocked.length > 0 && memberRoles.some(r => blocked.includes(r))) return false;
  if (allowed.length > 0 && !memberRoles.some(r => allowed.includes(r))) return false;
  return true;
}

export function getCommandConfig(guildId, commandName) {
  const key = cfgKey(guildId, commandName);
  return commandConfigs.get(key) || null;
}

export async function setCommandConfig(guildId, commandName, data) {
  const key = cfgKey(guildId, commandName);
  commandConfigs.set(key, {
    enabled: data.enabled ? true : false,
    allowedRoles: data.allowedRoles || [],
    blockedRoles: data.blockedRoles || [],
  });
  await CommandConfig.findOneAndUpdate(
    { guildId, commandName },
    {
      guildId,
      commandName,
      enabled: data.enabled ? true : false,
      allowedRoles: data.allowedRoles || [],
      blockedRoles: data.blockedRoles || [],
    },
    { upsert: true, new: true }
  );
}

export async function loadCommandConfigsFromDB() {
  const rows = await CommandConfig.find({}).lean();
  for (const row of rows) {
    const key = cfgKey(row.guildId, row.commandName);
    commandConfigs.set(key, {
      enabled: row.enabled === true,
      allowedRoles: row.allowedRoles || [],
      blockedRoles: row.blockedRoles || [],
    });
  }
  console.log(`[Commands] Loaded ${rows.length} configs from DB`);
}

export async function loadConfigsFromDB() {
  const rows = await GuildConfig.find({}).lean();
  for (const row of rows) {
    configCache.set(`${row.guildId}:${row.key}`, row.value);
  }
  console.log(`[Config] Loaded ${rows.length} guild configs from DB`);

  const warns = await Warning.find({}).sort({ timestamp: -1 }).lean();
  for (const w of warns) {
    const key = warnKey(w.guildId, w.userId);
    if (!warningCache.has(key)) warningCache.set(key, []);
    warningCache.get(key).push(w);
  }
  console.log(`[Warnings] Loaded ${warns.length} warnings from DB`);
}

export async function deleteGuildData(guildId) {
  const prefix = `${guildId}:`;
  for (const key of configCache.keys()) {
    if (key.startsWith(prefix)) configCache.delete(key);
  }
  for (const key of warningCache.keys()) {
    if (key.startsWith(prefix)) warningCache.delete(key);
  }
  for (const key of commandConfigs.keys()) {
    if (key.startsWith(prefix)) commandConfigs.delete(key);
  }
  await Promise.all([
    GuildConfig.deleteMany({ guildId }),
    Warning.deleteMany({ guildId }),
    AntiSpam.deleteMany({ guildId }),
    AntiNuke.deleteMany({ guildId }),
    CommandConfig.deleteMany({ guildId }),
  ]);
}
