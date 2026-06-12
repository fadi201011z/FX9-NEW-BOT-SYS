import GuildSetup from '../models/GuildSetup.js';
import VoiceChannel from '../models/VoiceChannel.js';

export async function loadGuilds() {
  const docs = await GuildSetup.find({}).lean();
  const map = {};
  for (const d of docs) map[d.guildId] = d;
  return map;
}

export async function saveGuild(guildId, cfg) {
  try {
    await GuildSetup.findOneAndUpdate({ guildId }, cfg, { upsert: true });
  } catch (err) {
    console.error('[DB] saveGuild error:', err.message);
  }
}

export async function deleteGuild(guildId) {
  try {
    await GuildSetup.deleteOne({ guildId });
  } catch (err) {
    console.error('[DB] deleteGuild error:', err.message);
  }
}

export async function loadActiveChannels() {
  const docs = await VoiceChannel.find({}).lean();
  const map = {};
  for (const d of docs) map[d.vcId] = d;
  return map;
}

export async function saveActiveChannel(vcId, data) {
  try {
    await VoiceChannel.findOneAndUpdate({ vcId }, data, { upsert: true });
  } catch (err) {
    console.error('[DB] saveActiveChannel error:', err.message);
  }
}

export async function removeActiveChannel(vcId) {
  try {
    await VoiceChannel.deleteOne({ vcId });
  } catch (err) {
    console.error('[DB] removeActiveChannel error:', err.message);
  }
}
