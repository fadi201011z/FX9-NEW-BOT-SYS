import { getAllSubscriptions, updateSubscription } from '../data/notificationDB.js';
import { youtubeEmbed, twitchEmbed } from '../utils/notificationEmbeds.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let twitchToken = null;
let twitchTokenExpires = 0;

// ─── Extract channel ID from YouTube URL ──────────────────────────────────
async function resolveYouTubeChannelId(url) {
  const clean = url.trim().replace(/\/$/, '');

  // Direct channel ID: youtube.com/channel/UC...
  const chMatch = clean.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (chMatch) return chMatch[1];

  // User: youtube.com/user/...
  const userMatch = clean.match(/youtube\.com\/user\/([\w-]+)/i);
  if (userMatch) return userMatch[1];

  // @handle: youtube.com/@handle → fetch page for channelId
  const handleMatch = clean.match(/youtube\.com\/@([\w-]+)/i);
  if (handleMatch) {
    try {
      const res = await fetch(`https://www.youtube.com/@${handleMatch[1]}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const html = await res.text();
      const idMatch = html.match(/"channelId":"(UC[\w-]+)"/);
      if (idMatch) return idMatch[1];
    } catch {}
  }

  // /c/name → fetch page
  const cMatch = clean.match(/youtube\.com\/c\/([\w-]+)/i);
  if (cMatch) {
    try {
      const res = await fetch(`https://www.youtube.com/c/${cMatch[1]}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const html = await res.text();
      const idMatch = html.match(/"channelId":"(UC[\w-]+)"/);
      if (idMatch) return idMatch[1];
    } catch {}
  }

  return null;
}

// ─── Fetch latest video via RSS ────────────────────────────────────────────
async function fetchLatestYouTubeVideo(channelId) {
  const rssUrl = channelId.startsWith('UC')
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    : `https://www.youtube.com/feeds/videos.xml?user=${channelId}`;

  const res = await fetch(rssUrl);
  const xml = await res.text();

  const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
  if (!entryMatch) return null;

  const entry = entryMatch[0];
  const videoId = entry.match(/yt:video:([\w-]+)/)?.[1];
  const title = entry.match(/<title>(.+?)<\/title>/)?.[1]?.trim();
  const publishedRaw = entry.match(/<published>(.+?)<\/published>/)?.[1];
  const channelName = entry.match(/<name>(.+?)<\/name>/)?.[1]?.trim();

  if (!videoId || !title) return null;

  return {
    videoId,
    title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    channelId,
    channelName: channelName?.replace(/&amp;/g, '&') || channelId,
    publishedAt: publishedRaw ? new Date(publishedRaw).getTime() : Date.now(),
  };
}

// ─── Twitch Auth ───────────────────────────────────────────────────────────
async function ensureTwitchToken() {
  if (twitchToken && Date.now() < twitchTokenExpires) return twitchToken;
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    twitchToken = data.access_token;
    twitchTokenExpires = Date.now() + (data.expires_in - 60) * 1000;
    return twitchToken;
  }
  return null;
}

// ─── Fetch Twitch stream status ────────────────────────────────────────────
async function fetchTwitchStream(userLogin) {
  const token = await ensureTwitchToken();
  if (!token) return null;

  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${userLogin}`, {
    headers: {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  return data.data?.[0] || null;
}

// ─── Resolve Twitch user login from URL ────────────────────────────────────
function resolveTwitchUser(url) {
  const m = url.match(/twitch\.tv\/([\w_]+)/i);
  return m ? m[1] : url.trim().replace(/^@/, '');
}

// ─── Send notification to Discord ──────────────────────────────────────────
async function sendNotification(client, sub, embed) {
  try {
    const ch = await client.channels.fetch(sub.discordChannelId).catch(() => null);
    if (!ch) return;

    const content = sub.customMessage || undefined;
    await ch.send({ content, embeds: [embed] });
  } catch (err) {
    console.error(`[Notif] Send error (${sub._id}):`, err.message);
  }
}

// ─── Check YouTube subscriptions ───────────────────────────────────────────
async function checkYouTube(client) {
  const subs = getAllSubscriptions().filter(s => s.platform === 'youtube' && s.channelId);

  for (const sub of subs) {
    try {
      const video = await fetchLatestYouTubeVideo(sub.channelId);
      if (!video) continue;

      if (video.videoId !== sub.lastVideoId) {
        await sendNotification(client, sub, youtubeEmbed(video));
        await updateSubscription(sub._id.toString(), {
          lastVideoId: video.videoId,
          channelName: video.channelName || sub.channelName,
        });
      }
    } catch (err) {
      console.error(`[Notif] YouTube check error (${sub._id}):`, err.message);
    }
  }
}

// ─── Check Twitch subscriptions ────────────────────────────────────────────
async function checkTwitch(client) {
  const subs = getAllSubscriptions().filter(s => s.platform === 'twitch' && s.channelId);

  for (const sub of subs) {
    try {
      const stream = await fetchTwitchStream(sub.channelId);
      const isLive = !!stream;

      if (isLive && !sub.lastStreamStatus) {
        // Just went live → send notification
        const embed = twitchEmbed({
          title: stream.title,
          url: `https://twitch.tv/${sub.channelId}`,
          thumbnail: stream.thumbnail_url
            ? stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720')
            : null,
          userName: stream.user_name,
          userLogin: sub.channelId,
          gameName: stream.game_name,
          viewerCount: stream.viewer_count,
        });
        await sendNotification(client, sub, embed);
      }

      await updateSubscription(sub._id.toString(), { lastStreamStatus: isLive });
    } catch (err) {
      console.error(`[Notif] Twitch check error (${sub._id}):`, err.message);
    }
  }
}

// ─── Main loop ─────────────────────────────────────────────────────────────
export function startNotificationMonitor(client) {
  async function run() {
    await checkYouTube(client).catch(e => console.error('[Notif] YouTube batch error:', e.message));
    await checkTwitch(client).catch(e => console.error('[Notif] Twitch batch error:', e.message));
  }

  run();
  setInterval(run, CHECK_INTERVAL_MS);
  console.log('  🔔  Notification monitor active (check every 5 min)');
}
