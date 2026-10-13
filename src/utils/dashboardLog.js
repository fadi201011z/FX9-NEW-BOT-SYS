/**
 * dashboardLog.js — mirrors the bot's own Discord log messages to the dashboard.
 *
 * Every embed the bot posts to a configured log channel (server / mod / bot) is
 * queued here and flushed to POST {DASHBOARD_URL}/api/server-logs in small
 * batches, authenticated with the shared API_SECRET. It is deliberately
 * fire-and-forget: a slow or unreachable dashboard must never delay or break a
 * Discord log send, so the queue is bounded and a failed batch is dropped
 * rather than retried forever.
 *
 * The feature is a no-op unless both DASHBOARD_URL and API_SECRET are set.
 */

import process from 'node:process';

const DASHBOARD_URL = (process.env.DASHBOARD_URL || '').replace(/\/+$/, '');
const API_SECRET = process.env.API_SECRET || '';

const FLUSH_MS = 8_000;
const MAX_BATCH = 40;
const MAX_QUEUE = 500;
const MAX_EMBED_JSON = 6_000;
const REQUEST_TIMEOUT_MS = 8_000;

const EMBED_KEYS = ['title', 'description', 'url', 'color', 'timestamp', 'footer', 'thumbnail', 'image', 'author'];

export const mirrorEnabled = Boolean(DASHBOARD_URL && API_SECRET);

const queue = [];
let timer = null;
let flushing = false;

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
 * Queue one Discord message (the exact payload passed to `channel.send`) for the
 * dashboard. Safe to call on every send: it returns immediately and never throws.
 */
export function mirrorServerLog(guildId, channelId, source, payload) {
  if (!mirrorEnabled || !guildId) return;
  try {
    const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
    const content = typeof payload?.content === 'string' ? payload.content.slice(0, 2_000) : undefined;
    if (!embeds.length && !content) return;

    queue.push({
      guildId: String(guildId),
      channelId: channelId ? String(channelId) : undefined,
      source: ['server', 'mod', 'bot'].includes(source) ? source : 'server',
      content,
      embeds: embeds.slice(0, 5).map(sanitizeEmbed).filter(Boolean),
      timestamp: Date.now(),
    });
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    schedule();
  } catch { /* never let log mirroring break the caller */ }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void flush(); }, FLUSH_MS);
  if (timer.unref) timer.unref();
}

/** Flush the queue to the dashboard. Called on a timer; exported for shutdown. */
export async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  try {
    while (queue.length) {
      const batch = queue.splice(0, MAX_BATCH);
      try {
        await fetch(`${DASHBOARD_URL}/api/server-logs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': API_SECRET },
          body: JSON.stringify({ logs: batch }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Dropped on purpose — see the file header.
      }
    }
  } finally {
    flushing = false;
  }
}
