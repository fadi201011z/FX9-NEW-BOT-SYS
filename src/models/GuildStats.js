import mongoose from 'mongoose';

/**
 * One document per guild per UTC day — the raw material for the dashboard's
 * "حالة سرفرك" page.
 *
 * Joins and leaves are counted as they happen because they are facts that
 * happen exactly once. The online count is *sampled* instead: nobody is
 * notified when somebody goes online, so the day keeps the highest sample it
 * saw and the page reports a peak rather than an average of guesses.
 *
 * `date` is a string (YYYY-MM-DD) rather than a Date so the unique index is
 * the day itself — no timezone edge where "today" becomes two documents.
 */
const guildStatsSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  date: { type: String, required: true },
  joins: { type: Number, default: 0 },
  leaves: { type: Number, default: 0 },
  memberCount: { type: Number, default: 0 },
  onlinePeak: { type: Number, default: 0 },
  humans: { type: Number, default: 0 },
  bots: { type: Number, default: 0 },
}, { timestamps: true });

guildStatsSchema.index({ guildId: 1, date: -1 }, { unique: true });

export default mongoose.model('GuildStats', guildStatsSchema);
