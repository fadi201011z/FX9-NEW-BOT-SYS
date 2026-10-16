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

// ─── Custom sections ────────────────────────────────────────────────────────
//
// The dashboard's "أقسام التذاكر" editor writes an array of sections into
// TicketGuildConfig (the `sections` field). This block is the whole vocabulary
// the bot needs to read that array, kept pure so it can be reasoned about (and
// tested) without a database behind it.
//
// `DEFAULT_SECTIONS` is the same four categories as the tables above, in the
// same order, with the same fields — assembled rather than retyped so the two
// can never drift. A guild that has never touched the editor has no `sections`,
// and resolves to exactly these, which is why the panel is byte-identical to
// what it was before the editor existed.

/** The four built-in categories as section objects, for guilds with no saved sections. */
export const DEFAULT_SECTIONS = [
  { id: 'technical',   emoji: '🛠️', label: 'Technical Support', description: 'Bugs, errors, anything broken',   color: '#3b82f6', enabled: true, supportRoleIds: [], fields: CATEGORY_MODAL_FIELDS.technical },
  { id: 'complaint',   emoji: '🚫', label: 'Report',            description: 'Report a member or a problem',    color: '#ef4444', enabled: true, supportRoleIds: [], fields: CATEGORY_MODAL_FIELDS.complaint },
  { id: 'partnership', emoji: '🤝', label: 'Partnership',       description: 'Sponsorships and collaborations', color: '#22c55e', enabled: true, supportRoleIds: [], fields: CATEGORY_MODAL_FIELDS.partnership },
  { id: 'other',       emoji: '❓', label: 'Other',             description: 'Anything that does not fit above', color: '#fbbf24', enabled: true, supportRoleIds: [], fields: CATEGORY_MODAL_FIELDS.other },
];

/**
 * The sections a guild actually saved, or an empty array. A section without an
 * id is unusable (its id is the menu value and part of the modal's custom id),
 * so it is dropped rather than repaired.
 */
export function savedSections(config) {
  return Array.isArray(config?.sections)
    ? config.sections.filter((s) => s && typeof s.id === 'string' && s.id)
    : [];
}

/**
 * The sections the panel should offer: the enabled saved ones, or the defaults
 * when the guild saved nothing — or saved only hidden sections, in which case
 * an empty menu would be worse than the built-ins.
 */
export function panelSections(config) {
  const saved = savedSections(config);
  if (!saved.length) return DEFAULT_SECTIONS;
  const enabled = saved.filter((s) => s.enabled !== false);
  return enabled.length ? enabled : DEFAULT_SECTIONS;
}

/** A section by id, saved first, defaults second, null when nothing matches. */
export function findSection(config, id) {
  return savedSections(config).find((s) => s.id === id)
    ?? DEFAULT_SECTIONS.find((s) => s.id === id)
    ?? null;
}

/**
 * The modal inputs for a section. A modal with no inputs is rejected outright
 * by Discord, so an empty or label-less list falls back to the section's own
 * built-in fields, and to `other`'s as a last resort. Capped at five, the
 * modal ceiling.
 */
export function sectionFields(section) {
  const fields = Array.isArray(section?.fields)
    ? section.fields.filter((f) => f && typeof f.id === 'string' && f.id && f.label)
    : [];
  if (fields.length) return fields.slice(0, 5);
  const fallback = DEFAULT_SECTIONS.find((s) => s.id === section?.id);
  return fallback?.fields?.length ? fallback.fields : CATEGORY_MODAL_FIELDS.other;
}

/**
 * How a ticket displays its category. The display is copied onto the ticket
 * when it is opened, so a ticket keeps reading the same after its section is
 * renamed or deleted; older tickets, which carry only `category`, fall back to
 * the built-in tables.
 */
export function ticketCategoryLabel(ticket, fallback = '—') {
  return ticket?.categoryLabel || CATEGORY_LABEL[ticket?.category] || ticket?.category || fallback;
}

export function ticketCategoryEmoji(ticket, fallback = '📋') {
  return ticket?.categoryEmoji || CATEGORY_EMOJI[ticket?.category] || fallback;
}

/** '#rrggbb' → integer for an embed colour; null when it is not a hex colour. */
export function parseColor(hex) {
  const m = typeof hex === 'string' ? /^#?([0-9a-f]{6})$/i.exec(hex.trim()) : null;
  return m ? parseInt(m[1], 16) : null;
}