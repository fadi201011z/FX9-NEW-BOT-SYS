/**
 * menuContent.js — the text behind the `/help` and `/setup` menus.
 *
 * Why this file exists
 * --------------------
 * The help menu lived inline in interactionCreate.js while `/help` had its own
 * hand-written copy in help.js. They drifted: the menu offered seven sections
 * while `/help` announced "6 أقسام", and both advertised `/profile`, a command
 * that does not exist in this bot.
 *
 * The fix is structural, not textual. Command lists are now derived from the
 * loaded command modules at runtime, so a command cannot be missing from help
 * unless it is missing from the bot. Counts cannot go stale.
 */

import { field } from './embeds.js';

// ─── Help sections ─────────────────────────────────────────────────────────
// Each section names the folders it covers. The command list inside it is read
// from disk, never typed by hand.

export const HELP_SECTIONS = [
  {
    value: 'help_setup',
    title: '⚙️ Setup — command guide',
    blurb: 'One-time configuration for every system.',
    folders: ['setup'],
  },
  {
    value: 'help_mod',
    title: '🔨 Moderation — command guide',
    blurb: 'Requires **Manage Channels** or **Kick Members**.',
    folders: ['moderation'],
  },
  {
    value: 'help_ticket',
    title: '🎫 Tickets — command guide',
    blurb: 'A full support ticket system with ratings and staff replies.',
    folders: ['ticket'],
  },
  {
    value: 'help_voice',
    title: '🔊 Temporary voice — command guide',
    blurb: 'Join-to-create temporary voice channels with a full control panel.',
    folders: ['voice'],
  },
  {
    value: 'help_info',
    title: '📊 Information — command guide',
    blurb: 'General statistics about the server and the bot.',
    folders: ['info'],
  },
  {
    value: 'help_members',
    title: '👥 Members — command guide',
    blurb: 'Commands available to every member.',
    folders: ['members'],
  },
  {
    value: 'help_protection',
    title: '🛡️ Alerts & protection — overview',
    blurb: 'These run automatically. No command needed.',
    folders: ['announcement', 'notifications'],
    // The automatic systems have no commands, so their description is authored.
    staticFields: [
      ['Anti-spam', '5 messages in 5 seconds → 60-second mute, and the message is logged.'],
      ['Anti-link', 'Links are deleted and recorded in the modlog.'],
      ['Anti-mention', '5+ mentions in one message → deleted immediately, and logged.'],
      ['Anti-nuke', '3+ channel deletions or 5+ bans in 10 seconds → the account loses its roles and an alert is sent.'],
      ['Raid detection', '10+ joins in 10 seconds → an alert is sent.'],
      ['Bot log', 'Startup, shutdown and every error, plus a heartbeat report every 10 minutes.'],
    ],
  },
];

/** Folder → human-readable heading, used when a section spans several folders. */
const FOLDER_LABEL = {
  setup: 'Setup',
  moderation: 'Moderation',
  ticket: 'Tickets',
  voice: 'Temporary voice',
  info: 'Information',
  members: 'Members',
  announcement: 'Announcements',
  notifications: 'Notifications',
};

// ─── Setup walkthroughs ────────────────────────────────────────────────────
// These are procedures, not command lists: ordered steps a server owner
// follows once. Values are `[label, lines[]]`.

export const SETUP_SECTIONS = [
  {
    value: 'setup_ticket',
    title: '🎫 Setting up the ticket system',
    blurb: 'Run these in order.',
    groups: [
      ['1️⃣ Base setup', [
        '`/configt setup` — start the guided setup wizard.',
      ]],
      ['2️⃣ Channels', [
        '`/configt panel_channel #channel` — where the ticket panel is posted.',
        '`/configt ticket_category #category` — where member tickets are created.',
      ]],
      ['3️⃣ Two-channel mode (optional)', [
        '`/configt admin_category #category` — gives each ticket a member channel *and* a staff channel.',
      ]],
      ['4️⃣ Support roles', [
        '`/configt support_role add @role` — repeat to add more.',
      ]],
      ['5️⃣ Ticket archive', [
        '`/configt log_channel #channel` — where closed tickets are recorded.',
      ]],
      ['✅ Afterwards', [
        '`/panel` — posts the ticket panel into the channel you configured.',
      ]],
    ],
  },
  {
    value: 'setup_voice',
    title: '🎙️ Setting up temporary voice channels',
    blurb: 'Join-to-create, with a full control panel.',
    groups: [
      ['1️⃣ Create the structure', [
        '① Create a **Category** — e.g. "🎤 Voice Channels".',
        '② Create a **voice channel** named "➕ Join to create" inside it.',
        '③ Create a **text channel** named "🎛️ Controls" inside it.',
      ]],
      ['2️⃣ Run setup', [
        '`/setup-voice category:#category join_channel:#join text_channel:#controls`',
        '> The settings save automatically and the control panel posts itself.',
      ]],
      ['🔹 Note', [
        'Settings persist across restarts — there is nothing to re-run.',
      ]],
    ],
  },
  {
    value: 'setup_general',
    title: '⚙️ General settings',
    blurb: 'Welcome messages, logs, statistics and moderation roles.',
    groups: [
      ['🎉 Welcome channel', '`/setup-welcome #channel` — greets members as they join.'],
      ['📋 Server log', '`/setup-logs #channel` — records message deletes/edits and joins/leaves.'],
      ['📝 Modlog', '`/setup-modlogs #channel` — records every moderation action.'],
      ['📊 Statistics', '`/setup-stats` — creates voice channels that show live server stats (refreshed every minute).'],
      ['🔍 Review settings', '`/config` — shows every current setting for this server.'],
    ],
  },
  {
    value: 'setup_bot',
    title: '🤖 Bot settings',
    blurb: 'The bot log and system information.',
    groups: [
      ['📟 Bot log', '`/setup-botlogs #channel` — records startup, shutdown and errors, plus a periodic report.'],
      ['ℹ️ System information', [
        '`/sysinfo` — details about the bot and its developer.',
        '`/config` — the current settings for this server.',
      ]],
    ],
  },
];

/** Options for the /help select menu. */
export function helpMenuOptions() {
  return HELP_SECTIONS.map((section) => ({
    label: section.title.replace(/^[^\w]+\s*/, ''),
    description: section.blurb.slice(0, 100),
    value: section.value,
  }));
}

/** Options for the /setup select menu. */
export function setupMenuOptions() {
  return SETUP_SECTIONS.map((section) => ({
    label: section.title.replace(/^[^\w]+\s*/, ''),
    description: section.blurb.slice(0, 100),
    value: section.value,
  }));
}

/**
 * Turn loaded command modules into embed fields, one command per line.
 *
 * Chunked so a section with many commands produces several fields instead of
 * one that overflows Discord's 1024-character field limit.
 *
 * @param {Array<{name:string, folder:string, mod:object}>} modules
 * @param {string[]} folders                 folders to include, in order
 * @param {number}  [maxChars=950]           per-field budget
 */
export function commandFields(modules, folders, maxChars = 950) {
  const byFolder = new Map();

  for (const folder of folders) {
    const inFolder = modules
      .filter((m) => m.folder === folder && typeof m.mod.execute === 'function')
      .sort((a, b) => a.name.localeCompare(b.name));

    if (inFolder.length === 0) continue;

    byFolder.set(folder, inFolder.map((m) => {
      const description = (m.mod.data.description || '').split('\n')[0];
      return `\`/${m.name}\` — ${description}`;
    }));
  }

  const fields = [];

  for (const [folder, lines] of byFolder) {
    const label = FOLDER_LABEL[folder] ?? folder;
    let chunk = [];
    let size = 0;

    for (const line of lines) {
      // +1 for the newline joiner.
      if (chunk.length && size + line.length + 1 > maxChars) {
        fields.push(field(label, chunk.join('\n'), false));
        chunk = [];
        size = 0;
      }
      chunk.push(line);
      size += line.length + 1;
    }

    if (chunk.length) fields.push(field(label, chunk.join('\n'), false));
  }

  return fields;
}

/** Fields for a section's authored (non-command) content. */
export function staticFields(section) {
  return (section.staticFields ?? []).map(([name, value]) => field(name, value, false));
}