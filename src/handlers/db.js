import GuildSetup from '../models/GuildSetup.js';
import VoiceChannel from '../models/VoiceChannel.js';

export async function loadGuilds() {
  const docs = await GuildSetup.find({}).lean();
  const map = {};
  for (const d of docs) map[d.guildId] = d;
  return map;
}

export function saveGuild(guildId, cfg) {
  return GuildSetup.findOneAndUpdate({ guildId }, cfg, { upsert: true }).catch(() => {});
}

export function deleteGuild(guildId) {
  return GuildSetup.deleteOne({ guildId }).catch(() => {});
}

export async function loadActiveChannels() {
  const docs = await VoiceChannel.find({}).lean();
  const map = {};
  for (const d of docs) map[d.vcId] = d;
  return map;
}

export function saveActiveChannel(vcId, data) {
  return VoiceChannel.findOneAndUpdate({ vcId }, data, { upsert: true }).catch(() => {});
}

export function removeActiveChannel(vcId) {
  return VoiceChannel.deleteOne({ vcId }).catch(() => {});
}
