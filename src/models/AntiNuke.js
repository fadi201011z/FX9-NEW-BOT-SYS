import mongoose from 'mongoose';

const antiNukeSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  action: { type: String, required: true },
  count: { type: Number, default: 0 },
  lastReset: { type: Number, default: 0 },
}, { timestamps: true });

antiNukeSchema.index({ guildId: 1, userId: 1, action: 1 }, { unique: true });

export default mongoose.model('AntiNuke', antiNukeSchema);
