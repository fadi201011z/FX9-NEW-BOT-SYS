import { EmbedBuilder } from 'discord.js';

const COLOR = {
  youtube: 0xff0000,
  twitch:  0x9146ff,
  twitter: 0x1da1f2,
};

export function youtubeEmbed(video) {
  return new EmbedBuilder()
    .setColor(COLOR.youtube)
    .setTitle('📹 فيديو جديد على يوتيوب')
    .setDescription(`### [${video.title}](${video.url})`)
    .setURL(video.url)
    .setThumbnail(video.thumbnail)
    .setImage(video.thumbnail)
    .addFields(
      { name: 'القناة', value: `[${video.channelName}](https://www.youtube.com/channel/${video.channelId})`, inline: true },
      { name: 'تاريخ النشر', value: `<t:${Math.floor(video.publishedAt / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'FX9 Notifier • YouTube', iconURL: 'https://cdn3.emoji.gg/emojis/4197-youtube.png' })
    .setTimestamp();
}

export function twitchEmbed(stream) {
  return new EmbedBuilder()
    .setColor(COLOR.twitch)
    .setTitle('🔴 مباشر الآن على Twitch!')
    .setDescription(`### [${stream.title}](${stream.url})`)
    .setURL(stream.url)
    .setImage(stream.thumbnail)
    .addFields(
      { name: 'القناة', value: `[${stream.userName}](https://twitch.tv/${stream.userLogin})`, inline: true },
      { name: 'اللعبة', value: stream.gameName || 'غير محدد', inline: true },
      { name: 'المشاهدين', value: String(stream.viewerCount ?? 0), inline: true },
    )
    .setFooter({ text: 'FX9 Notifier • Twitch', iconURL: 'https://cdn3.emoji.gg/emojis/8204-twitch.png' })
    .setTimestamp();
}

export function twitterEmbed(tweet) {
  return new EmbedBuilder()
    .setColor(COLOR.twitter)
    .setTitle('🐦 تغريدة جديدة')
    .setDescription(tweet.text?.slice(0, 2000) || '')
    .setURL(tweet.url)
    .setAuthor({ name: tweet.userName, iconURL: tweet.avatar, url: tweet.profileUrl })
    .setFooter({ text: 'FX9 Notifier • Twitter/X', iconURL: 'https://cdn3.emoji.gg/emojis/8644-twitter.png' })
    .setTimestamp();
}
