import mongoose from 'mongoose';

const antiSpamSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  messageCount: { type: Number, default: 0 },
  lastReset: { type: Number, default: 0 },
}, { timestamps: true });

antiSpamSchema.index({ guildId: 1, userId: 1 }, { unique: true });

export default mongoose.model('AntiSpam', antiSpamSchema);
