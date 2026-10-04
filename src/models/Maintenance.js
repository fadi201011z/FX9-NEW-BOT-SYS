import mongoose from 'mongoose';

const maintenanceSchema = new mongoose.Schema({
  enabled:  { type: Boolean, default: false },
  endTime:  { type: Number, default: null },
  durationMinutes: { type: Number, default: 0 },
  message:  { type: String, default: 'The bot is under maintenance and development. Please check back later.' },
  channelId:{ type: String, default: '' },
  startedAt:{ type: Number, default: null },
  updatedAt:{ type: Number, default: Date.now },
  updatedBy:{ type: String, default: '' },
  changelog:{ type: Object, default: { botUpdates: '', siteUpdates: '' } },
});

export default mongoose.model('Maintenance', maintenanceSchema);
