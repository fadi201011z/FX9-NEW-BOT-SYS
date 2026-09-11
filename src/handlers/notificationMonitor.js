import { getAllSubscriptions, updateSubscription, claimYouTubeVideo } from '../data/notificationDB.js';
import { youtubeEmbed, kickEmbed, twitterEmbed } from '../utils/notificationEmbeds.js';

const CHECK_INTERVAL_MS = 1 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
//  YouTube — via RSS (no API needed)
// ═══════════════════════════════════════════════════════════════════════════

export async function resolveYouTubeChannelId(url) {
  const clean = url.trim().replace(/\/[?#].*$/, '').replace(/\/$/, '');

  // Direct channel ID: youtube.com/channel/UC...
  const chMatch = clean.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (chMatch) return chMatch[1];

  // Extract handle/username for page fetch
  let handle = null;
  const handleMatch = clean.match(/youtube\.com\/@([\w-]+)/i);
  if (handleMatch) handle = handleMatch[1];
  const userMatch = clean.match(/youtube\.com\/user\/([\w-]+)/i);
  if (!handle && userMatch) handle = userMatch[1];
  const cMatch = clean.match(/youtube\.com\/c\/([\w-]+)/i);
  if (!handle && cMatch) handle = cMatch[1];

  if (!handle) return null;

  // Fetch the channel page and extract channelId from ytInitialData JSON
  for (const page of [`https://www.youtube.com/@${handle}`, `https://www.youtube.com/@${handle}/about`]) {
    try {
      const res = await fetch(page, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      });
      const html = await res.text();

      // Try to extract from ytInitialData JSON
      const ytMatch = html.match(/ytInitialData\s*=\s*({.+?});\s*<\/script>/);
      if (ytMatch) {
        try {
          const data = JSON.parse(ytMatch[1]);
          const id = data?.metadata?.channelMetadataRenderer?.externalId
                  || data?.header?.c4TabbedHeaderRenderer?.channelId
                  || data?.microformat?.microformatDataRenderer?.externalId;
          if (id) return id;
        } catch {}
      }

      // Fallback: regex search for channelId
      const idMatch = html.match(/"channelId":"(UC[\w-]+)"/)
                   || html.match(/"externalId":"(UC[\w-]+)"/);
      if (idMatch) return idMatch[1];
    } catch {}
  }

  return null;
}

async function fetchYouTubeChannelAvatar(channelId) {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const m = html.match(/"avatar":\s*\[\s*\{\s*"url":\s*"([^"]+)"/);
    if (m) return m[1].replace(/\\u0026/g, '&');
  } catch {}
  return null;
}

export { youtubeEmbed, kickEmbed, twitterEmbed } from '../utils/notificationEmbeds.js';

export async function fetchLatestYouTubeVideo(channelId) {
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
  const canonicalChannelId = entry.match(/yt:channelId:([\w-]+)/)?.[1];

  if (!videoId || !title) return null;

  const channelAvatar = await fetchYouTubeChannelAvatar(canonicalChannelId || channelId);

  return {
    videoId,
    title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    channelId: canonicalChannelId || channelId,
    channelName: channelName?.replace(/&amp;/g, '&') || channelId,
    channelAvatar,
    publishedAt: publishedRaw ? new Date(publishedRaw).getTime() : Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Kick — via public API — robust fetch w/ retry + clear status (live/offline/error)
// ═══════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Several request identities: profile #1 (compat, minimal headers) is the one
// that used to work before the 403s; #2 is browser-like; #3 is bare. When every
// identity returns 403 the datacenter IP itself is blocked -> public proxy fallback.
const KICK_GEN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const KICK_PROFILES = [
  { name: 'compat', headers: { 'User-Agent': KICK_GEN, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://kick.com/' } },
  { name: 'modern', headers: { 'User-Agent': KICK_GEN, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://kick.com/', 'Origin': 'https://kick.com', 'X-Requested-With': 'XMLHttpRequest', 'Cache-Control': 'no-cache' } },
  { name: 'plain',  headers: { 'User-Agent': 'Mozilla/5.0' } },
];

async function kickFetchDirect(url) {
  let sawTooManyRequests = false;
  for (const profile of KICK_PROFILES) {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(url, { headers: profile.headers, signal: AbortSignal.timeout(8000) });
        if (res.status === 429) { sawTooManyRequests = true; await sleep(1500 * (i + 1)); continue; }
        if (res.status >= 500) { await sleep(1000 * (i + 1)); continue; }
        if (res.ok) return { status: 'json', data: await res.json(), via: profile.name };
        if (res.status === 403 || res.status === 401) break;
        return { status: 'http', code: res.status };
      } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') { await sleep(800 * (i + 1)); continue; }
        return { status: 'error', message: err.message };
      }
    }
  }
  return sawTooManyRequests ? { status: 'http', code: 429 } : { status: 'blocked' };
}

// Last-resort fetch through public CORS proxies (Kick sometimes serves these).
const KICK_PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

async function kickFetchViaProxy(url) {
  for (let pi = 0; pi < KICK_PROXIES.length; pi++) {
    try {
      const res = await fetch(KICK_PROXIES[pi](url), { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data && typeof data === 'object') return { status: 'json', data, via: 'proxy#' + (pi + 1) };
      } catch {}
    } catch {}
  }
  return { status: 'error', message: 'proxies blocked' };
}

async function kickFetch(url) {
  const direct = await kickFetchDirect(url);
  if (direct.status === 'blocked') return await kickFetchViaProxy(url);
  return direct;
}

export async function fetchKickStream(slug) {
  const cleaned = String(slug || '').trim().replace(/^@/, '').toLowerCase();
  if (!cleaned) return { status: 'error', message: 'معرف القناة فارغ' };

  const res = await kickFetch(`https://kick.com/api/v2/channels/${encodeURIComponent(cleaned)}`);
  if (res.status === 'http') {
    if (res.code === 403 || res.code === 401) {
      return { status: 'error', message: 'Kick يحجب طلبات هذا الخادم (403) حتى عبر عدة هويات — الحل: تشغيل البوت على VPS أو إعادة المحاولة لاحقاً' };
    }
    if (res.code === 429) {
      return { status: 'error', message: 'Kick يحدّ من الطلبات مؤقتاً (429) — سيعود تلقائياً بعد دقائق' };
    }
    if (res.code === 404) {
      return { status: 'error', message: 'القناة غير موجودة على Kick — تحقق من الرابط' };
    }
    return { status: 'offline' };
  }
  if (res.status === 'error') {
    return { status: 'error', message: 'Kick يرفض طلبات هذا الخادم حالياً حتى عبر الوسيط — جرب تشغيل البوت على VPS أو أعد المحاولة لاحقاً' };
  }

  const data = res.data;
  if (!data || !data.livestream) {
    // Channel is known but not streaming right now — normal offline state
    return { status: 'offline' };
  }

  const channelName = data.user?.username || data.slug || cleaned;
  let streamId = '';
  if (data.livestream.id !== undefined && data.livestream.id !== null) streamId = String(data.livestream.id);
  else if (data.livestream._id !== undefined && data.livestream._id !== null) streamId = String(data.livestream._id);
  else streamId = data.livestream.session_title + '|' + (data.livestream.created_at || '') + '|' + cleaned;
  const thumbnail = streamId ? `https://images.kick.com/${streamId}/thumbnails/1280x720.jpg` : null;
  const category = (data.livestream.categories && data.livestream.categories[0]?.name) || null;

  return {
    status: 'live',
    stream: {
      id: streamId,
      isLive: true,
      title: data.livestream.session_title || 'Untitled Stream',
      slug: data.slug || cleaned,
      channelName,
      channelAvatar: data.user?.profile_pic || data.user?.avatar || null,
      viewerCount: data.livestream.viewer_count || 0,
      thumbnail,
      category,
      url: `https://kick.com/${data.slug || cleaned}`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Twitter — via Nitter RSS (no API needed)
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchLatestTweet(username) {
  const instances = ['nitter.net', 'nitter.privacydev.net', 'nitter.lqdev.tech'];
  for (const instance of instances) {
    try {
      const res = await fetch(`https://${instance}/${username}/rss`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
      if (!entryMatch) continue;

      const entry = entryMatch[0];
      const tweetUrl = entry.match(/<link[^>]*href="(.+?)"/)?.[1];
      const title = entry.match(/<title>(.+?)<\/title>/)?.[1]?.trim();

      if (!tweetUrl) continue;

      let channelAvatar = null;
      try {
        const profileRes = await fetch(`https://${instance}/${username}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const profileHtml = await profileRes.text();
        const imgMatch = profileHtml.match(/<img[^>]*class="avatar"[^>]*src="([^"]+)"/);
        if (imgMatch) channelAvatar = imgMatch[1].startsWith('http') ? imgMatch[1] : `https://${instance}${imgMatch[1]}`;
      } catch {}

      return {
        tweetId: tweetUrl.split('/').pop() || tweetUrl,
        text: title?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '',
        url: tweetUrl,
        userName: `@${username}`,
        profileUrl: `https://x.com/${username}`,
        channelAvatar,
      };
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Common
// ═══════════════════════════════════════════════════════════════════════════

export async function sendNotification(client, sub, embed) {
  try {
    const ch = await client.channels.fetch(sub.discordChannelId).catch(() => null);
    if (!ch) return false;
    const parts = [];
    parts.push('@everyone');
    if (sub.customMessage) parts.push(sub.customMessage);
    const content = parts.join(' | ');
    await ch.send({ content, embeds: [embed] });
    return true;
  } catch (err) {
    console.error(`[Notif] Send error (${sub._id}):`, err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Checks
// ═══════════════════════════════════════════════════════════════════════════

const ytSent = new Set();

async function checkYouTube(client) {
  const subs = getAllSubscriptions().filter(s => s.platform === 'youtube' && s.channelId);
  ytSent.clear();

  for (const sub of subs) {
    try {
      const video = await fetchLatestYouTubeVideo(sub.channelId);
      if (!video) continue;

      // Time guard: never notify about a video OLDER than the last one sent.
      const lastAt = Number(sub.lastVideoAt) || 0;
      if (lastAt > 0 && Number(video.publishedAt) <= lastAt) continue;

      // First sighting for this subscription: only record the baseline (no spam).
      if (!sub.lastVideoId) {
        await updateSubscription(sub._id.toString(), {
          lastVideoId: video.videoId,
          lastVideoAt: Number(video.publishedAt) || Date.now(),
          channelName: video.channelName || sub.channelName,
        });
        continue;
      }

      if (video.videoId === sub.lastVideoId) continue;
      const prevId = sub.lastVideoId;

      // Same channel sent to another server this cycle: record silently.
      const key = `${video.channelId}:${sub.discordChannelId}:${video.videoId}`;
      if (ytSent.has(key)) {
        await updateSubscription(sub._id.toString(), {
          lastVideoId: video.videoId,
          lastVideoAt: Number(video.publishedAt) || Date.now(),
          channelName: video.channelName || sub.channelName,
        });
        continue;
      }

      // Atomic DB claim: exactly one writer sends this video for this sub,
      // even if "check now" / /add run while the monitor is iterating.
      const claimed = await claimYouTubeVideo(sub._id.toString(), video);
      if (!claimed) continue;

      const sent = await sendNotification(client, sub, youtubeEmbed(video));
      if (sent) {
        ytSent.add(key);
      } else {
        // Rollback the claim so the notification is retried on the next cycle.
        await updateSubscription(sub._id.toString(), {
          lastVideoId: prevId || '',
          lastVideoAt: lastAt,
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`[Notif] YouTube check error (${sub._id}):`, err.message);
    }
  }
}

const recentlyNotified = new Set();
// After a hard Kick error, skip that channel for a while to avoid log/API spam
const kickCooldown = new Map();
const KICK_COOLDOWN_MS = 5 * 60 * 1000;

async function checkKick(client) {
  const subs = getAllSubscriptions().filter(s => s.platform === 'kick' && s.channelId);
  recentlyNotified.clear();
  for (const sub of subs) {
    const slug = String(sub.channelId || '').trim().replace(/^@/, '');
    if (kickCooldown.get(slug) > Date.now()) continue;
    try {
      const result = await fetchKickStream(sub.channelId);
      if (result.status === 'error') {
        kickCooldown.set(slug, Date.now() + KICK_COOLDOWN_MS);
        console.error(`[Notif] Kick "${slug}" muted 5m — ${result.message}`);
        continue;
      }
      kickCooldown.delete(slug);

      const isLive = result.status === 'live';
      const stream = isLive ? result.stream : null;

      if (sub.lastStreamStatus === undefined) {
        await updateSubscription(sub._id.toString(), { lastStreamStatus: isLive, lastStreamId: stream?.id || '' });
        continue;
      }

      if (isLive) {
        if (recentlyNotified.has(slug)) continue;
        if (stream.id !== sub.lastStreamId) {
          const sent = await sendNotification(client, sub, kickEmbed(stream));
          if (sent) {
            await updateSubscription(sub._id.toString(), { lastStreamStatus: true, lastStreamId: stream.id });
            recentlyNotified.add(slug);
          }
        }
      } else {
        if (sub.lastStreamStatus) {
          await updateSubscription(sub._id.toString(), { lastStreamStatus: false, lastStreamId: '' });
        }
      }
    } catch (err) {
      console.error(`[Notif] Kick check error (${sub._id}):`, err.message);
    }
  }
}

async function checkTwitter(client) {
  const subs = getAllSubscriptions().filter(s => s.platform === 'twitter' && s.channelId);
  for (const sub of subs) {
    try {
      const tweet = await fetchLatestTweet(sub.channelId);
      if (!tweet) continue;

      if (tweet.tweetId !== sub.lastVideoId) {
        const sent = await sendNotification(client, sub, twitterEmbed(tweet));
        if (sent) {
          await updateSubscription(sub._id.toString(), {
            lastVideoId: tweet.tweetId,
            channelName: sub.channelName || tweet.userName,
          });
        }
      }
    } catch (err) {
      console.error(`[Notif] Twitter check error (${sub._id}):`, err.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Immediate check for a single subscription (called after /notify add)
// ═══════════════════════════════════════════════════════════════════════════

export async function checkSubscriptionNow(client, sub) {
  if (sub.platform === 'youtube' && sub.channelId) {
    const video = await fetchLatestYouTubeVideo(sub.channelId);
    if (!video) return '❌ تعذر جلب الفيديو من RSS يوتيوب';

    const lastAt = Number(sub.lastVideoAt) || 0;
    if (lastAt > 0 && Number(video.publishedAt) <= lastAt) {
      return 'لا يوجد فيديو جديد أحدث من الفيديو المُرسل مسبقاً';
    }
    const prevId = sub.lastVideoId;

    const claimed = await claimYouTubeVideo(sub._id.toString(), video);
    if (!claimed) return 'ℹ️ هذا الفيديو تم إرساله مسبقاً (سجل مكرر)';

    const sent = await sendNotification(client, sub, youtubeEmbed(video));
    if (!sent) {
      await updateSubscription(sub._id.toString(), { lastVideoId: prevId || '', lastVideoAt: lastAt }).catch(() => {});
      return '❌ فشل الإرسال إلى ديسكورد';
    }
    return `فيديو: ${video.title}`;
  }

  if (sub.platform === 'kick' && sub.channelId) {
    const result = await fetchKickStream(sub.channelId);
    if (result.status === 'error') return `❌ ${result.message}`;
    if (result.status === 'offline') return 'غير متصل حالياً — لا يوجد بث مباشر';
    const stream = result.stream;
    const sent = await sendNotification(client, sub, kickEmbed(stream));
    if (sent) {
      await updateSubscription(sub._id.toString(), { lastStreamStatus: true, lastStreamId: stream.id || '' });
    }
    return sent ? `بث: ${stream.title}` : '❌ فشل الإرسال';
  }

  if (sub.platform === 'twitter' && sub.channelId) {
    const tweet = await fetchLatestTweet(sub.channelId);
    if (tweet) {
      const sent = await sendNotification(client, sub, twitterEmbed(tweet));
      if (sent) {
        await updateSubscription(sub._id.toString(), {
          lastVideoId: tweet.tweetId,
          channelName: sub.channelName || tweet.userName,
        });
      }
      return sent ? `تغريدة: ${tweet.text?.slice(0, 50)}` : '❌ فشل الإرسال';
    }
    return '❌ تعذر جلب التغريدة';
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main loop
// ═══════════════════════════════════════════════════════════════════════════

export function startNotificationMonitor(client) {
  async function run() {
    await Promise.all([
      checkYouTube(client).catch(e => console.error('[Notif] YouTube batch:', e.message)),
      checkKick(client).catch(e => console.error('[Notif] Kick batch:', e.message)),
      checkTwitter(client).catch(e => console.error('[Notif] Twitter batch:', e.message)),
    ]);
  }

  run();
  setInterval(run, CHECK_INTERVAL_MS);
  console.log('  🔔  Notification monitor active (YouTube + Kick + Twitter, every 1 min)');
}