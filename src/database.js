import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'bot.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL;');

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (guild_id, key)
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS anti_spam (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    last_reset INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS anti_nuke (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    last_reset INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, action)
  );

  CREATE TABLE IF NOT EXISTS command_config (
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    allowed_roles TEXT DEFAULT '[]',
    allowed_channels TEXT DEFAULT '[]',
    blocked_channels TEXT DEFAULT '[]',
    PRIMARY KEY (guild_id, command_name)
  );
`);

try { db.exec('ALTER TABLE command_config ADD COLUMN blocked_roles TEXT DEFAULT \'[]\''); } catch (e) {}


// ─── Guild Config ──────────────────────────────────────────────────────────

export function getConfig(guildId, key) {
  const stmt = db.prepare('SELECT value FROM guild_config WHERE guild_id = ? AND key = ?');
  const row = stmt.get(guildId, key);
  return row ? row.value : null;
}

export function setConfig(guildId, key, value) {
  db.prepare('INSERT OR REPLACE INTO guild_config (guild_id, key, value) VALUES (?, ?, ?)').run(guildId, key, value);
}

// ─── Warnings ──────────────────────────────────────────────────────────────

export function addWarning(guildId, userId, moderatorId, reason) {
  return db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, moderatorId, reason, Date.now());
}

export function getWarnings(guildId, userId) {
  return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC').all(guildId, userId);
}

export function clearWarnings(guildId, userId) {
  return db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

// ─── Anti-Spam ─────────────────────────────────────────────────────────────

export function getSpamData(guildId, userId) {
  return db.prepare('SELECT * FROM anti_spam WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

export function upsertSpamData(guildId, userId, count, lastReset) {
  db.prepare('INSERT OR REPLACE INTO anti_spam (guild_id, user_id, message_count, last_reset) VALUES (?, ?, ?, ?)').run(guildId, userId, count, lastReset);
}

// ─── Anti-Nuke ─────────────────────────────────────────────────────────────

export function getNukeData(guildId, userId, action) {
  return db.prepare('SELECT * FROM anti_nuke WHERE guild_id = ? AND user_id = ? AND action = ?').get(guildId, userId, action);
}

export function upsertNukeData(guildId, userId, action, count, lastReset) {
  db.prepare('INSERT OR REPLACE INTO anti_nuke (guild_id, user_id, action, count, last_reset) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, action, count, lastReset);
}

// ─── Command Config (Bot-Managed Only) ────────────────────────────────────

export const commandConfigs = new Map();
const commandRoles = new Map();

function cfgKey(guildId, commandName) { return `${guildId}:${commandName}`; }

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
  if (blocked.length > 0 && memberRoles.some(r => blocked.includes(r))) return false;
  if (allowed.length > 0 && !memberRoles.some(r => allowed.includes(r))) return false;
  return true;
}

export function getCommandConfig(guildId, commandName) {
  const key = cfgKey(guildId, commandName);
  return commandConfigs.get(key) || null;
}

export function setCommandConfig(guildId, commandName, data) {
  const key = cfgKey(guildId, commandName);
  commandConfigs.set(key, {
    enabled: data.enabled ? true : false,
    allowedRoles: data.allowedRoles || [],
    blockedRoles: data.blockedRoles || [],
  });
  const existing = db.prepare('SELECT * FROM command_config WHERE guild_id = ? AND command_name = ?').get(guildId, commandName);
  if (existing) {
    db.prepare('UPDATE command_config SET enabled = ?, allowed_roles = ?, blocked_roles = ? WHERE guild_id = ? AND command_name = ?')
      .run(data.enabled ? 1 : 0, JSON.stringify(data.allowedRoles || []), JSON.stringify(data.blockedRoles || []), guildId, commandName);
  } else {
    db.prepare('INSERT INTO command_config (guild_id, command_name, enabled, allowed_roles, blocked_roles) VALUES (?, ?, ?, ?, ?)')
      .run(guildId, commandName, data.enabled ? 1 : 0, JSON.stringify(data.allowedRoles || []), JSON.stringify(data.blockedRoles || []));
  }
}

export function loadCommandConfigsFromDB() {
  const rows = db.prepare('SELECT * FROM command_config').all();
  for (const row of rows) {
    const key = cfgKey(row.guild_id, row.command_name);
    commandConfigs.set(key, {
      enabled: row.enabled === 1,
      allowedRoles: row.allowed_roles ? JSON.parse(row.allowed_roles) : [],
      blockedRoles: row.blocked_roles ? JSON.parse(row.blocked_roles) : [],
    });
  }
  console.log(`[Commands] Loaded ${rows.length} configs from DB`);
}

export default db;
