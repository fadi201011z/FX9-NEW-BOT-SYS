import mongoose from 'mongoose';

const adminStatsSchema = new mongoose.Schema({
  adminId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  claimed: { type: Number, default: 0 },
  closed: { type: Number, default: 0 },
  totalRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('AdminStats', adminStatsSchema);
