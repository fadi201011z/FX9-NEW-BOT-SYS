/**
 * embeds.js — the bot's entire visual vocabulary.
 *
 * Design rules, applied everywhere in this file:
 *
 *   1. No ANSI code blocks. Discord renders ```ansi monospaced and does not
 *      interpret escape codes, so `\u001b[1;31m` produced a grey box and nothing
 *      else. Colour comes from the embed's own colour bar instead.
 *   2. No `━━━━` dividers. They were a 2021 trend, they render inconsistently
 *      across clients, and they cost vertical space that the data needs.
 *   3. One colour palette, seven entries, named for meaning rather than hue.
 *      The file used to export two palettes (`Colors` with 18 names, `COLOR`
 *      with 8) covering 14 distinct hexes; `RED`, `ERROR`, `MOD` and `ROLE` were
 *      all the same colour under four names.
 *   4. Embeds only where there is structured data to scan. A one-line result is
 *      plain ephemeral text — see `ok()` and `fail()`.
 *   5. Modlog entries all go through `logEntry()`, so the 13 moderation
 *      commands cannot drift apart visually.
 */

import { fileURLToPath } from 'node:url';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { CATEGORY_LABEL } from '../data/ticketTypes.js';
import { formatDuration } from './parseDuration.js';
import { resolveGuildImage } from './guildImage.js';

/** Ephemeral replies. Kept as a named constant so it is never magic-numbered. */
export const EPHEMERAL = 64;

/**
 * The whole palette. Seven colours, each named for what it means.
 *
 *   ok       an action completed
 *   error    a failure, or a destructive action taken against someone
 *   warn     caution — something needs attention but nothing broke
 *   info     neutral information
 *   accent   the product's own colour (tickets, panels, branding)
 *   gold     highlights and praise (ratings)
 *   neutral  log entries that carry no opinion
 */
export const C = {
  ok:      0x22c55e,
  error:   0xef4444,
  warn:    0xf59e0b,
  info:    0x3b82f6,
  accent:  0x8b5cf6,
  gold:    0xfbbf24,
  neutral: 0x1e293b,
};

/**
 * Discord dropped discriminators; `user.tag` only exists on partial users now.
 * Anything can legitimately be missing, so every path has a fallback.
 */
export function userTag(user) {
  if (!user) return 'Unknown';
  try {
    return user.tag || user.username || user.id || 'Unknown';
  } catch {
    return user.username || user.id || 'Unknown';
  }
}

// ─── Plain-text replies ────────────────────────────────────────────────────
// A confirmation does not need a colour bar, a footer and a timestamp to say
// four words. These are the single most common reply in the bot and they were
// all full embeds.

export function ok(text) {
  return { content: `✅ ${text}`, flags: EPHEMERAL };
}

export function fail(text) {
  return { content: `❌ ${text}`, flags: EPHEMERAL };
}

// ─── notice(): the one general-purpose embed ───────────────────────────────
//

/**
 * Build the standard embed.
 *
 * @param {object}   opts
 * @param {string}   opts.title      required
 * @param {number}  [opts.color]     defaults to C.info
 * @param {string}  [opts.description]
 * @param {Array}   [opts.fields]    EmbedBuilder field objects
 * @param {string}  [opts.thumbnail] URL
 * @param {string}  [opts.image]     URL
 * @param {string}  [opts.footer]    shown only where a source matters
 * @param {boolean} [opts.timestamp] logs default to true, replies to false
 */
export function notice({ title, color = C.info, description, fields, thumbnail, image, footer: footerText, timestamp = false }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title);
  if (description) embed.setDescription(description);
  if (fields?.length) embed.addFields(fields);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (footerText) embed.setFooter({ text: footerText });
  if (timestamp) embed.setTimestamp();
  return embed;
}

/** Inline field helper — keeps call sites readable. */
export function field(name, value, inline = true) {
  return { name, value: String(value ?? '—'), inline };
}

// ─── logEntry(): one shape for every moderation log ────────────────────────
//
// Previously ban/kick/timeout used `modEmbed` and the other ten moderation
// commands each hand-rolled their own near-identical version of the same
// description. Same data, two shapes. This is the single builder now.

const LOG_TITLES = {
  ban: '🔨 Member banned',
  kick: '👢 Member kicked',
  timeout: '⏱ Member timed out',
  warn: '⚠️ Warning issued',
  warn_clear: '🧹 Warnings cleared',
  clear: '🧹 Messages purged',
  lock: '🔒 Channel locked',
  unlock: '🔓 Channel unlocked',
  hide: '🙈 Channel hidden',
  unhide: '👁️ Channel shown',
  nick: '📝 Nickname changed',
  role_add: '🎖️ Role granted',
  role_remove: '🎖️ Role revoked',
  slowmode: '🐌 Slowmode changed',
  role_create: '🎖️ Role created',
  role_delete: '🗑️ Role deleted',
  channel_create: '📁 Channel created',
  channel_delete: '🗑️ Channel deleted',
  channel_update: '📁 Channel updated',
  member_join: '📥 Member joined',
  member_remove: '👋 Member left',
  member_update: '👤 Member updated',
  member_ban: '🔨 Member banned',
  member_unban: '♻️ Member unbanned',
  message_delete: '🗑️ Message deleted',
  message_bulk_delete: '🧹 Bulk delete',
  message_update: '✏️ Message edited',
  raid: '🚨 Raid detected',
  voice_join: '🎤 Joined a voice channel',
  voice_leave: '🔇 Left a voice channel',
  voice_switch: '🔀 Moved between voice channels',
  tempvc_created: '🔊 Temporary voice channel created',
  tempvc_deleted: '🗑️ Temporary voice channel deleted',
  restricted_channel: '🚫 Restricted channel violation',
  automod_spam: '🤖 Auto-mod — spam',
  automod_links: '🔗 Auto-mod — link removed',
  automod_mentions: '💬 Auto-mod — mass mentions',
};

const LOG_COLORS = {
  ban: C.error, kick: C.error, member_ban: C.error,
  warn_clear: C.ok, clear: C.ok, role_remove: C.warn,
  raid: C.error, member_unban: C.ok, member_join: C.ok,
  voice_join: C.ok, voice_leave: C.neutral, voice_switch: C.info,
  tempvc_created: C.info, tempvc_deleted: C.neutral,
  restricted_channel: C.error,
  automod_spam: C.error, automod_links: C.warn, automod_mentions: C.warn,
};

/**
 * @param {object} opts
 * @param {string} opts.kind       key of LOG_TITLES
 * @param {string} [opts.actor]    who performed it
 * @param {string} [opts.target]   who/what it happened to
 * @param {string} [opts.reason]
 * @param {Array}  [opts.fields]   extra fields
 * @param {string} [opts.footer]
 */
export function logEntry({ kind, actor, target, reason, fields, footer: footerText = 'Kratos System' }) {
  const rows = [];
  if (target) rows.push(field('Target', target));
  if (actor) rows.push(field('Moderator', actor));
  if (reason) rows.push(field('Reason', String(reason).slice(0, 1024), false));
  if (fields?.length) rows.push(...fields);

  return notice({
    title: LOG_TITLES[kind] ?? '📋 Log',
    color: LOG_COLORS[kind] ?? C.neutral,
    fields: rows,
    footer: footerText,
    timestamp: true,
  });
}

// ─── Ticket panel ──────────────────────────────────────────────────────────

const PANEL_IMAGE = fileURLToPath(new URL('../../assets/panel.png', import.meta.url));

/**
 * The /panel payload. A guild's own panel image (set from the dashboard) wins
 * over the bundled default.
 */
export function panelPayload(guildId) {
  const custom = guildId && resolveGuildImage(guildId, 'ticket_panel_image');
  return {
    files: [{ attachment: custom ? (custom.buffer || custom.url) : PANEL_IMAGE, name: 'panel.png' }],
    components: [panelMenu()],
  };
}

export function panelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_category')
      .setPlaceholder('Select a category to open a ticket…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Technical Support').setDescription('Bugs, errors, anything broken').setValue('technical').setEmoji('🛠️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Report').setDescription('Report a member or a problem').setValue('complaint').setEmoji('🚫'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Partnership').setDescription('Sponsorships and collaborations').setValue('partnership').setEmoji('🤝'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Other').setDescription('Anything that does not fit above').setValue('other').setEmoji('❓'),
      )
  );
}

// ─── Ticket ────────────────────────────────────────────────────────────────

const CATEGORY_COLOR = {
  technical: C.info,
  complaint: C.error,
  partnership: C.ok,
  other: C.gold,
};

/**
 * The ticket itself. This one earns its embed: it carries the ticket's state,
 * who opened it, what they asked for, and it is the anchor for the action
 * buttons below it.
 */
export function ticketEmbed(t, adminChannel = false) {
  const color = adminChannel ? C.accent : (CATEGORY_COLOR[t.category] ?? C.info);
  const label = CATEGORY_LABEL[t.category] ?? t.category;
  const priority = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' }[t.priority] ?? t.priority;

  const fields = [
    field('Opened by', `<@${t.userId}>${t.username ? ` (${t.username})` : ''}`),
    field('Category', label),
    field('Priority', priority),
    field('Ticket', `\`${t.ticketId}\``),
    field('Summary', t.title ?? '—', false),
    field('Details', t.description ?? '—', false),
  ];

  if (t.evidence) fields.push(field('Evidence', t.evidence, false));
  if (Array.isArray(t.extra) && t.extra.length) {
    for (const item of t.extra) fields.push(field(item.label, item.value, false));
  }

  return notice({
    title: `${adminChannel ? '🔐' : '🎫'} ${t.ticketId} — ${label}`,
    description: adminChannel
      ? 'Staff channel — replies here are delivered to the member automatically.'
      : 'Opened. Our team will reply here shortly.',
    color,
    fields,
    footer: `Kratos System • ${t.ticketId}`,
    timestamp: true,
  });
}

export function ticketButtons(claimed, claimedByUsername, adminMode = false) {
  const row1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_actions')
      .setPlaceholder('Select an action…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(claimed ? `✅ Claimed by ${claimedByUsername ?? '—'}` : '📩 Claim')
          .setDescription(claimed ? 'Already claimed by a staff member' : 'Take ownership of this ticket')
          .setValue('claim')
          .setEmoji('📩'),
        new StringSelectMenuOptionBuilder()
          .setLabel('📤 Unclaim')
          .setDescription('Return this ticket to the queue')
          .setValue('unclaim')
          .setEmoji('📤'),
        new StringSelectMenuOptionBuilder()
          .setLabel('✏️ Rename channel')
          .setDescription("Change this ticket's channel name")
          .setValue('rename')
          .setEmoji('✏️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🔒 Close ticket')
          .setDescription('Close and remove the channel')
          .setValue('close')
          .setEmoji('🔒'),
      )
  );

  const rows = [row1];

  if (adminMode) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_quickreply')
        .setPlaceholder('Quick reply…')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Under review').setDescription('We are looking into it').setValue('reviewing').setEmoji('🔍'),
          new StringSelectMenuOptionBuilder().setLabel('Need more info').setDescription('We need screenshots or details').setValue('need_evidence').setEmoji('📸'),
          new StringSelectMenuOptionBuilder().setLabel('Resolved').setDescription('The issue has been fixed').setValue('resolved').setEmoji('✅'),
          new StringSelectMenuOptionBuilder().setLabel('Need clarification').setDescription('Could you clarify?').setValue('clarify').setEmoji('❓'),
          new StringSelectMenuOptionBuilder().setLabel('Thanks for reaching out').setDescription('A closing thank-you').setValue('thanks').setEmoji('🙏'),
          new StringSelectMenuOptionBuilder().setLabel('Escalating').setDescription('Handing this to another team').setValue('transfer').setEmoji('🔄'),
          new StringSelectMenuOptionBuilder().setLabel('Known issue').setDescription('We are already fixing this').setValue('known_issue').setEmoji('⚠️'),
        )
    ));
  }

  return rows;
}

// ─── Rating ────────────────────────────────────────────────────────────────

/**
 * Shown after a ticket closes. This used to be 22 lines of description with
 * three divider blocks and an ANSI table spelling out the five stars — all of
 * which the five buttons directly below already say.
 */
export function ratingEmbed(ticketId, adminUsername) {
  return notice({
    title: '⭐ Rate your support experience',
    description: `Thanks for contacting ${adminUsername ? `**${adminUsername}**` : 'our support team'}.\nPick a rating below — the channel deletes itself 20 minutes after you do.`,
    color: C.gold,
    fields: [field('Ticket', `\`${ticketId}\``)],
    footer: 'Kratos System • Rating',
  });
}

export function ratingButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rate_1_${ticketId}`).setEmoji('1️⃣').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rate_2_${ticketId}`).setEmoji('2️⃣').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`rate_3_${ticketId}`).setEmoji('3️⃣').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rate_4_${ticketId}`).setEmoji('4️⃣').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rate_5_${ticketId}`).setEmoji('5️⃣').setStyle(ButtonStyle.Success),
  );
}

// ─── Ticket close summary ──────────────────────────────────────────────────

export function closeEmbed(ticket, closedBy) {
  const rating = ticket.rating ? '⭐'.repeat(ticket.rating) : 'Not rated';

  return notice({
    title: `🔒 Ticket closed — ${ticket.ticketId}`,
    color: C.error,
    fields: [
      field('Ticket', `\`${ticket.ticketId}\``),
      field('Category', CATEGORY_LABEL[ticket.category] ?? ticket.category ?? '—'),
      field('Opened by', `<@${ticket.userId}>${ticket.username ? ` (${ticket.username})` : ''}`),
      field('Claimed by', ticket.claimedBy ? `<@${ticket.claimedBy}>` : '❌ Not claimed'),
      field('Closed by', `<@${closedBy}>`),
      field('Duration', formatDuration(Date.now() - ticket.openedAt)),
      field('Opened', `<t:${Math.floor(ticket.openedAt / 1000)}:f>`),
      field('Closed', `<t:${Math.floor(Date.now() / 1000)}:f>`),
      field('Summary', ticket.title ?? '—', false),
      field('Rating', rating),
    ],
    footer: `Kratos System • ${ticket.ticketId}`,
    timestamp: true,
  });
}

// ─── Logs ──────────────────────────────────────────────────────────────────

export function logEmbed(title, color, fields) {
  return notice({ title, color, fields, footer: 'Kratos System', timestamp: true });
}

/** Inactivity nudge. One sentence — it was an ANSI block with two dividers. */
export function inactivityEmbed(ticketId) {
  return notice({
    title: '⏰ No recent activity',
    description: `No messages in this ticket for 24 hours. It will be closed automatically in 12 hours unless someone replies.`,
    color: C.warn,
    fields: [field('Ticket', `\`${ticketId}\``)],
    footer: 'Kratos System • Inactivity',
    timestamp: true,
  });
}

export function buildTicketLogEmbed(ticket) {
  const rating = ticket.rating ? `${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)` : 'Not rated';
  const status = {
    closed: { emoji: '🔒', text: 'Closed', color: C.error },
    claimed: { emoji: '📩', text: 'Claimed', color: C.info },
  }[ticket.status] ?? { emoji: '🟢', text: 'Open', color: C.ok };

  const fields = [
    field('Status', `${status.emoji} ${status.text}`),
    field('Member', `<@${ticket.userId}>`),
    field('Claimed by', ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—'),
    field('Opened', ticket.openedAt ? `<t:${Math.floor(ticket.openedAt / 1000)}:f>` : '—'),
    field('Closed', ticket.closedAt ? `<t:${Math.floor(ticket.closedAt / 1000)}:f>` : '—'),
    field('Summary', ticket.title ?? '—', false),
  ];

  if (ticket.rating) fields.push(field('Rating', rating));

  return notice({
    title: `🎫 ${ticket.ticketId} — ${CATEGORY_LABEL[ticket.category] ?? ticket.category ?? 'Ticket'}`,
    color: status.color,
    fields,
    footer: `Kratos System • ${ticket.ticketId}`,
    timestamp: true,
  });
}

export function ticketLogMenu(ticket) {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Full details')
      .setDescription(`Everything recorded for ${ticket.ticketId}`)
      .setValue(`details||${ticket.ticketId}`)
      .setEmoji('📋'),
  ];

  if (ticket.channelId) {
    options.push(new StringSelectMenuOptionBuilder()
      .setLabel('Member channel')
      .setDescription(`Go to the member's channel for ${ticket.ticketId}`)
      .setValue(`user_channel||${ticket.ticketId}`)
      .setEmoji('📩'));
  }

  if (ticket.adminChannelId) {
    options.push(new StringSelectMenuOptionBuilder()
      .setLabel('Staff channel')
      .setDescription(`Go to the staff channel for ${ticket.ticketId}`)
      .setValue(`admin_channel||${ticket.ticketId}`)
      .setEmoji('🔐'));
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_log_menu')
      .setPlaceholder('Ticket actions…')
      .addOptions(options),
  );
}