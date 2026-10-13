/**
 * dashboardLog.js — keeps the bot's own Discord log messages available to the
 * dashboard, and (optionally) pushes them to it in real time.
 *
 * There are two delivery paths over one source of truth:
 *
 *   1. PULL — every mirrored event is held in a small in-memory ring buffer per
 *      guild. The dashboard reads GET /api/dashboard-log?guildId=… and stores
 *      what it finds. This works even when DASHBOARD_URL is not set on this
 *      service, which is the usual reason a dashboard shows an empty log.
 *
 *   2. PUSH — when both DASHBOARD_URL and API_SECRET are set, the same events
 *      are also batched to POST {DASHBOARD_URL}/api/server-logs for near
 *      real-time display.
 *
 * Both paths carry identical entries (same `eventId`), so the dashboard's unique
 * index makes whichever arrives second a harmless no-op. Nothing here is ever
 * allowed to throw into a Discord send: a slow or unreachable dashboard must
 * never delay it.
 */

import process from 'node:process';

const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/+$/, '');
const API_SECRET = process.env.API_SECRET || '';

const FLUSH_MS = 8_000;
const MAX_BATCH = 40;
const MAX_QUEUE = 500;
const MAX_BUFFER = 300; // per guild, served by the pull endpoint
const MAX_EMBED_JSON = 6_000;
const REQUEST_TIMEOUT_MS = 8_000;

const EMBED_KEYS = ['title', 'description', 'url', 'color', 'timestamp', 'footer', 'thumbnail', 'image', 'author'];

/** True when the bot can push in real time (pull works regardless). */
export const mirrorEnabled = Boolean(DASHBOARD_URL && API_SECRET);

const queue = [];
let timer = null;
let flushing = false;
let seq = 0;

// Unique per process start, so an id is never reused across restarts.
const BOOT_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** guildId -> entries (oldest first), capped at MAX_BUFFER. */
const buffers = new Map();

const state = {
  received: 0,
  lastReceivedAt: 0,
  pushed: 0,
  lastPushAt: 0,
  lastError: null,
  lastErrorAt: 0,
};

function embedData(embed) {
  if (!embed || typeof embed !== 'object') return null;
  if (typeof embed.toJSON === 'function') {
    try { return embed.toJSON(); } catch { return null; }
  }
  return embed;
}

function sanitizeEmbed(embed) {
  const data = embedData(embed);
  if (!data) return null;

  const out = {};
  for (const key of EMBED_KEYS) if (data[key] !== undefined) out[key] = data[key];
  if (Array.isArray(data.fields)) {
    out.fields = data.fields.slice(0, 25).map((f) => ({
      name: f?.name,
      value: f?.value,
      inline: Boolean(f?.inline),
    }));
  }

  try {
    if (JSON.stringify(out).length > MAX_EMBED_JSON) {
      return {
        title: out.title,
        description: typeof out.description === 'string' ? out.description.slice(0, 1_500) : out.description,
        color: out.color,
      };
    }
  } catch { return null; }
  return out;
}

/**
 * Record one Discord message (the exact payload passed to `channel.send`) for
 * the dashboard. Safe to call on every send: it returns immediately, never
 * throws, and always buffers so a pull can find it.
 */
export function mirrorServerLog(guildId, channelId, source, payload) {
  if (!guildId) return;
  try {
    const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
    const content = typeof payload?.content === 'string' ? payload.content.slice(0, 2_000) : undefined;
    if (!embeds.length && !content) return;

    const entry = {
      eventId: `evt_${BOOT_ID}_${++seq}`,
      guildId: String(guildId),
      channelId: channelId ? String(channelId) : undefined,
      source: ['server', 'mod', 'bot'].includes(source) ? source : 'server',
      content,
      embeds: embeds.slice(0, 5).map(sanitizeEmbed).filter(Boolean),
      timestamp: Date.now(),
    };

    // Always buffer: the dashboard may pull instead of receiving a push.
    const guildKey = entry.guildId;
    let buf = buffers.get(guildKey);
    if (!buf) { buf = []; buffers.set(guildKey, buf); }
    buf.push(entry);
    if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);

    state.received += 1;
    state.lastReceivedAt = entry.timestamp;

    if (mirrorEnabled) {
      queue.push(entry);
      if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      schedule();
    }
  } catch { /* never let log mirroring break the caller */ }
}

/**
 * Recent mirrored events for one guild, oldest first. Consumed by the
 * dashboard's pull endpoint.
 */
export function getRecentLogs(guildId, { since = 0, limit = 200 } = {}) {
  const buf = buffers.get(String(guildId)) || [];
  const max = Math.min(Math.max(Number(limit) || 200, 1), MAX_BUFFER);
  const rows = since ? buf.filter((e) => e.timestamp > Number(since)) : buf;
  return rows.slice(-max);
}

/** Delivery health for the dashboard's diagnostics panel. */
export function getMirrorStatus() {
  let buffered = 0;
  for (const buf of buffers.values()) buffered += buf.length;
  return {
    enabled: mirrorEnabled,
    received: state.received,
    pushed: state.pushed,
    lastReceivedAt: state.lastReceivedAt,
    lastPushAt: state.lastPushAt,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    buffered,
    bufferedGuilds: buffers.size,
    uptimeAt: Date.now(),
  };
}

/** One clear line at boot so a silent misconfiguration is impossible to miss. */
export function logStartupStatus() {
  if (mirrorEnabled) {
    console.log(`[DashboardLog] real-time push ON → ${DASHBOARD_URL}/api/server-logs`);
  } else {
    console.warn('[DashboardLog] real-time push OFF (DASHBOARD_URL and/or API_SECRET not set). '
      + 'The dashboard can still PULL the latest events from /api/dashboard-log.');
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void flush(); }, FLUSH_MS);
  if (timer.unref) timer.unref();
}

/** Flush the queue to the dashboard. Called on a timer; exported for shutdown. */
export async function flush() {
  if (flushing || !queue.length || !mirrorEnabled) return;
  flushing = true;
  try {
    while (queue.length) {
      const batch = queue.splice(0, MAX_BATCH);
      try {
        const res = await fetch(`${DASHBOARD_URL}/api/server-logs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': API_SECRET },
          body: JSON.stringify({ logs: batch }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.pushed += batch.length;
        state.lastPushAt = Date.now();
        state.lastError = null;
      } catch (err) {
        // Dropped on purpose — see the file header. Kept for diagnostics only.
        state.lastError = String(err?.message || err);
        state.lastErrorAt = Date.now();
      }
    }
  } finally {
    flushing = false;
  }
}
