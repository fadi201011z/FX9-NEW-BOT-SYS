import mongoose from 'mongoose';

/**
 * TicketGuildConfig — one document per guild, shared verbatim with the
 * dashboard (both apps point at the same collection, so the two schemas must
 * describe the same shape or a save from one side would strip the other's
 * fields).
 *
 * `sections` is what the dashboard's "أقسام التذاكر" editor writes: the list of
 * ticket categories, each with its own emoji, name, description, optional
 * support roles, and the modal fields the member fills in. When it is empty the
 * bot falls back to the defaults compiled into `data/ticketTypes.js`, so an
 * untouched guild behaves exactly as it did before the editor existed.
 */

// One modal input. Discord's limits are baked into the defaults: the label is
// capped at 45 characters, the placeholder at 100, and a modal accepts at most
// five of these.
const ticketFieldSchema = new mongoose.Schema({
  id:          { type: String, default: '' },
  label:       { type: String, default: '' },
  placeholder: { type: String, default: '' },
  style:       { type: String, default: 'short' },   // 'short' | 'paragraph'
  required:    { type: Boolean, default: false },
  maxLength:   { type: Number, default: 500 },
}, { _id: false });

// One panel entry. `id` becomes part of the ticket channel name and of the
// custom id the modal carries, so it stays a lowercase ASCII slug.
const ticketSectionSchema = new mongoose.Schema({
  id:             { type: String, required: true },
  emoji:          { type: String, default: '🎫' },
  label:          { type: String, default: '' },
  description:    { type: String, default: '' },
  color:          { type: String, default: '' },
  enabled:        { type: Boolean, default: true },
  supportRoleIds: { type: [String], default: [] },
  fields:         { type: [ticketFieldSchema], default: [] },
}, { _id: false });

const ticketGuildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  ticketCategoryId: { type: String, default: '' },
  adminCategoryId: { type: String, default: '' },
  panelChannelId: { type: String, default: '' },
  logChannelId: { type: String, default: '' },
  supportRoleIds: { type: [String], default: [] },
  ticketCounter: { type: Number, default: 0 },
  sections: { type: [ticketSectionSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('TicketGuildConfig', ticketGuildConfigSchema);
