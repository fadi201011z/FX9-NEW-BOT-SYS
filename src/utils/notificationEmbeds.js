import { EmbedBuilder } from 'discord.js';

const COLOR = {
  youtube: 0xff0000,
  kick:    0x53fc18,
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
    .setFooter({ text: 'FX9 Notifier • YouTube' })
    .setTimestamp();
}

export function kickEmbed(stream) {
  return new EmbedBuilder()
    .setColor(COLOR.kick)
    .setTitle('🔴 مباشر الآن على Kick!')
    .setDescription(`### [${stream.title}](${stream.url})`)
    .setURL(stream.url)
    .setImage(stream.thumbnail)
    .addFields(
      { name: 'القناة', value: `[${stream.channelName}](https://kick.com/${stream.slug})`, inline: true },
      { name: 'المشاهدين', value: String(stream.viewerCount ?? 0), inline: true },
    )
    .setFooter({ text: 'FX9 Notifier • Kick' })
    .setTimestamp();
}

export function twitterEmbed(tweet) {
  return new EmbedBuilder()
    .setColor(COLOR.twitter)
    .setTitle('🐦 تغريدة جديدة')
    .setDescription(tweet.text?.slice(0, 2000) || '')
    .setURL(tweet.url)
    .setAuthor({ name: tweet.userName, iconURL: tweet.avatar, url: tweet.profileUrl })
    .setFooter({ text: 'FX9 Notifier • Twitter/X' })
    .setTimestamp();
}
