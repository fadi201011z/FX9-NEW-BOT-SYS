import mongoose from 'mongoose';
import Notification from './src/models/Notification.js';

const MONGODB_URI = 'mongodb+srv://fadidiscord12_db_user:fadi20101144@fadix01.tu6fvtq.mongodb.net/?appName=Fadix01';

async function debug() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const subs = await Notification.find({ platform: 'youtube' }).lean();
  if (subs.length === 0) {
    console.log('❌ No YouTube subscriptions found!');
    await mongoose.disconnect();
    return;
  }

  for (const sub of subs) {
    console.log('═══════════════════════════════════════');
    console.log(`Guild:       ${sub.guildId}`);
    console.log(`Channel URL: ${sub.channelUrl}`);
    console.log(`Channel ID:  ${sub.channelId}`);
    console.log(`Channel:     ${sub.channelName}`);
    console.log(`Discord Ch:  ${sub.discordChannelId}`);
    console.log(`lastVideoId: ${sub.lastVideoId || '(empty)'}`);
    console.log(`createdAt:   ${new Date(sub.createdAt).toISOString()}`);

    // Fetch RSS
    const rssUrl = sub.channelId.startsWith('UC')
      ? `https://www.youtube.com/feeds/videos.xml?channel_id=${sub.channelId}`
      : `https://www.youtube.com/feeds/videos.xml?user=${sub.channelId}`;
    
    console.log(`\n📡 Fetching RSS: ${rssUrl}`);
    try {
      const res = await fetch(rssUrl);
      const xml = await res.text();
      const entryMatch = xml.match(/<entry>[\s\S]*?<\/entry>/);
      if (!entryMatch) {
        console.log('❌ No entries found in RSS');
      } else {
        const entry = entryMatch[0];
        const videoId = entry.match(/yt:video:([\w-]+)/)?.[1];
        const title = entry.match(/<title>(.+?)<\/title>/)?.[1]?.trim();
        const publishedRaw = entry.match(/<published>(.+?)<\/published>/)?.[1];
        console.log(`📺 Latest:   ${videoId}`);
        console.log(`📺 Title:    ${title?.replace(/&amp;/g, '&')}`);
        console.log(`📺 Uploaded: ${publishedRaw}`);

        if (!sub.lastVideoId) {
          console.log('→ lastVideoId is EMPTY. Save current and skip.');
        } else if (videoId !== sub.lastVideoId) {
          console.log('→ NEW VIDEO DETECTED! Will send notification.');
        } else {
          console.log('→ Same video. No notification.');
        }
      }
    } catch (err) {
      console.log(`❌ RSS fetch error: ${err.message}`);
    }

    // Try fetching the channel page for avatar
    console.log(`\n📡 Fetching channel page for avatar...`);
    try {
      const res = await fetch(`https://www.youtube.com/channel/${sub.channelId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const html = await res.text();
      const hasPage = html.length > 1000;
      console.log(`📺 Page loaded: ${hasPage ? '✅' : '❌'} (${html.length} chars)`);
    } catch (err) {
      console.log(`❌ Page error: ${err.message}`);
    }

    console.log('');
  }

  await mongoose.disconnect();
  console.log('✅ Done');
}

debug().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
