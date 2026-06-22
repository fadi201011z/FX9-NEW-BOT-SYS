import mongoose from 'mongoose';

const maintenanceSchema = new mongoose.Schema({
  enabled:  { type: Boolean, default: false },
  endTime:  { type: Number, default: null },
  durationMinutes: { type: Number, default: 0 },
  message:  { type: String, default: 'البوت تحت الصيانة والتطوير حالياً. انتظر لوقت لاحق.' },
  updatedAt:{ type: Number, default: Date.now },
  updatedBy:{ type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Maintenance', maintenanceSchema);
