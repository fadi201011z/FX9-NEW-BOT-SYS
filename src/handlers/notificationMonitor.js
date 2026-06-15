import { getAllSubscriptions, updateSubscription } from '../data/notificationDB.js';
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

// ═══════════════════════════════════════════════════════════════════════════
//  Kick — via public API (no auth needed)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchKickStream(slug) {
  const res = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) return null;
  const data = await res.json();

  if (!data?.livestream) return null;

  return {
    isLive: true,
    title: data.livestream.session_title || 'بدون عنوان',
    slug: data.slug || slug,
    channelName: data.user?.username || slug,
    avatar: data.user?.profile_pic || null,
    viewerCount: data.livestream.viewer_count || 0,
    thumbnail: data.livestream?.thumbnail?.url
      ? data.livestream.thumbnail.url.replace('{width}', '1280').replace('{height}', '720')
      : null,
    url: `https://kick.com/${data.slug || slug}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Twitter — via Nitter RSS (no API needed)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchLatestTweet(username) {
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

      return {
        tweetId: tweetUrl.split('/').pop() || tweetUrl,
        text: title?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '',
        url: tweetUrl,
        userName: `@${username}`,
        profileUrl: `https://x.com/${username}`,
        avatar: null,
      };
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Common
// ═══════════════════════════════════════════════════════════════════════════

async function sendNotification(client, sub, embed) {
  try {
    const ch = await client.channels.fetch(sub.discordChannelId).catch(() => null);
    if (!ch) return;
    const parts = [];
    parts.push('@everyone');
    if (sub.customMessage) parts.push(sub.customMessage);
    const content = parts.join(' | ');
    await ch.send({ content, embeds: [embed] });
  } catch (err) {
    console.error(`[Notif] Send error (${sub._id}):`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Checks
// ═══════════════════════════════════════════════════════════════════════════

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

async function checkKick(client) {
  const subs = getAllSubscriptions().filter(s => s.platform === 'kick' && s.channelId);
  for (const sub of subs) {
    try {
      const stream = await fetchKickStream(sub.channelId);
      const isLive = !!stream;

      if (isLive && !sub.lastStreamStatus) {
        await sendNotification(client, sub, kickEmbed(stream));
      }

      if (sub.lastStreamStatus !== isLive) {
        await updateSubscription(sub._id.toString(), { lastStreamStatus: isLive });
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
        await sendNotification(client, sub, twitterEmbed(tweet));
        await updateSubscription(sub._id.toString(), {
          lastVideoId: tweet.tweetId,
          channelName: sub.channelName || tweet.userName,
        });
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
    if (video) {
      await sendNotification(client, sub, youtubeEmbed(video));
      await updateSubscription(sub._id.toString(), {
        lastVideoId: video.videoId,
        channelName: video.channelName || sub.channelName,
      });
      return `فيديو: ${video.title}`;
    }
  }

  if (sub.platform === 'kick' && sub.channelId) {
    const stream = await fetchKickStream(sub.channelId);
    if (stream) {
      await sendNotification(client, sub, kickEmbed(stream));
      await updateSubscription(sub._id.toString(), { lastStreamStatus: true });
      return `بث: ${stream.title}`;
    }
  }

  if (sub.platform === 'twitter' && sub.channelId) {
    const tweet = await fetchLatestTweet(sub.channelId);
    if (tweet) {
      await sendNotification(client, sub, twitterEmbed(tweet));
      await updateSubscription(sub._id.toString(), {
        lastVideoId: tweet.tweetId,
        channelName: sub.channelName || tweet.userName,
      });
      return `تغريدة: ${tweet.text?.slice(0, 50)}`;
    }
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
