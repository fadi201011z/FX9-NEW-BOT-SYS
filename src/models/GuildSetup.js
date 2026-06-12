import mongoose from 'mongoose';

const guildSetupSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  categoryId: { type: String, default: '' },
  joinChannelId: { type: String, default: '' },
  textChannelId: { type: String, default: '' },
  panelMessageId: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('GuildSetup', guildSetupSchema);
