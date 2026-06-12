import mongoose from 'mongoose';

const warningSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  moderatorId: { type: String, required: true },
  reason: { type: String, default: '' },
  timestamp: { type: Number, default: Date.now },
}, { timestamps: true });

warningSchema.index({ guildId: 1, userId: 1 });

export default mongoose.model('Warning', warningSchema);
