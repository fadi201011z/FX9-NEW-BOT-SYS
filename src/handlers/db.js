import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const GUILDS_FILE = path.join(DATA_DIR, 'guilds.json');
const ACTIVE_FILE = path.join(DATA_DIR, 'active_channels.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function _read(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return {}; }
}

function _write(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[DB] Write error:', e.message); }
}

export function loadGuilds() { return _read(GUILDS_FILE); }

export function saveGuild(guildId, cfg) {
  const all = _read(GUILDS_FILE);
  all[guildId] = cfg;
  _write(GUILDS_FILE, all);
}

export function deleteGuild(guildId) {
  const all = _read(GUILDS_FILE);
  delete all[guildId];
  _write(GUILDS_FILE, all);
}

export function loadActiveChannels() { return _read(ACTIVE_FILE); }

export function saveActiveChannel(vcId, data) {
  const all = _read(ACTIVE_FILE);
  all[vcId] = data;
  _write(ACTIVE_FILE, all);
}

export function removeActiveChannel(vcId) {
  const all = _read(ACTIVE_FILE);
  delete all[vcId];
  _write(ACTIVE_FILE, all);
}
