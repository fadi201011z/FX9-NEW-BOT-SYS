/**
 * ticketTypes.js — the ticket system's vocabulary.
 *
 * All user-facing strings are English so the bot reads the same in every
 * server. `CATEGORY_SLUG` is the only one that is not display text: it becomes
 * part of a channel name (`1-technical`), so it stays lowercase ASCII.
 */

export const CATEGORY_LABEL = {
  technical: "🛠️ Technical Support",
  complaint: "🚫 Report",
  partnership: "🤝 Partnership",
  other: "❓ Other",
};

export const CATEGORY_SLUG = {
  technical: "technical-support",
  complaint: "report",
  partnership: "partnership",
  other: "other",
};

export const PRIORITY_LABEL = {
  high: "🔴 High",
  medium: "🟡 Medium",
  low: "🟢 Low",
};

export const CATEGORY_EMOJI = {
  technical: "🛠️",
  complaint: "🚫",
  partnership: "🤝",
  other: "❓",
};

/** Per-category modal fields — one focused form per ticket type. */
export const CATEGORY_MODAL_FIELDS = {
  technical: [
    { id: 'title',        label: '📌 Summary',           placeholder: 'One line describing the problem',   style: 'short',     required: true,  maxLength: 100 },
    { id: 'device',       label: '🖥️ Platform',          placeholder: 'PC • Android • iOS',                style: 'short',     required: true,  maxLength: 50 },
    { id: 'description',  label: '📝 What happened?',    placeholder: 'What broke, and when did it start?', style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'steps_tried',  label: '🧪 Already tried',     placeholder: 'What have you done to fix it?',     style: 'paragraph', required: false, maxLength: 500 },
    { id: 'evidence',     label: '🔗 Evidence',          placeholder: 'Screenshot or video link',           style: 'short',     required: false, maxLength: 500 },
  ],
  complaint: [
    { id: 'title',        label: '📌 Summary',           placeholder: 'e.g. Harassment in general chat',     style: 'short',     required: true,  maxLength: 100 },
    { id: 'target',       label: '👤 Member involved',   placeholder: 'Name or user ID',                     style: 'short',     required: true,  maxLength: 50 },
    { id: 'description',  label: '📝 What happened?',    placeholder: 'Describe what occurred, in order',   style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'evidence',     label: '🔗 Evidence',          placeholder: 'Screenshot or recording link',         style: 'short',     required: false, maxLength: 500 },
  ],
  partnership: [
    { id: 'title',        label: '🤝 Collaboration type', placeholder: 'Sponsorship • Events • Partnership', style: 'short',    required: true,  maxLength: 100 },
    { id: 'link',         label: '🔗 Server or channel', placeholder: 'https://discord.gg/…',              style: 'short',     required: true,  maxLength: 200 },
    { id: 'description',  label: '📝 Your offer',        placeholder: 'Audience, role, and terms',           style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'evidence',     label: '🔗 Extra links',       placeholder: 'Any supporting links',                style: 'short',     required: false, maxLength: 500 },
  ],
  other: [
    { id: 'title',        label: '📌 Summary',           placeholder: 'One line describing your request',    style: 'short',     required: true,  maxLength: 100 },
    { id: 'description',  label: '📝 Details',           placeholder: 'What do you need?',                   style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'evidence',     label: '🔗 Evidence',          placeholder: 'Any helpful links (optional)',        style: 'short',     required: false, maxLength: 500 },
  ],
};