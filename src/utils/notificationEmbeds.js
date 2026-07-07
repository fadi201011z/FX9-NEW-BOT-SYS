import { EmbedBuilder } from 'discord.js';

const PLATFORM = {
  youtube: { name: 'YouTube', color: 0xff0000, logo: 'https://www.youtube.com/s/desktop/92a3e22b/img/favicon_144x144.png' },
  kick:    { name: 'Kick',    color: 0x53fc18, logo: 'https://kick.com/favicon.ico' },
  twitter: { name: 'Twitter', color: 0x1da1f2, logo: 'https://abs.twimg.com/favicons/twitter.2.ico' },
};

export function youtubeEmbed(video) {
  return new EmbedBuilder()
    .setColor(PLATFORM.youtube.color)
    .setAuthor({ name: PLATFORM.youtube.name, iconURL: PLATFORM.youtube.logo })
    .setTitle('فيديو جديد على يوتيوب')
    .setDescription(`### [${video.title}](${video.url})`)
    .setURL(video.url)
    .setThumbnail(video.channelAvatar || video.thumbnail)
    .setImage(video.thumbnail)
    .addFields(
      { name: 'القناة', value: `[${video.channelName}](https://www.youtube.com/channel/${video.channelId})`, inline: true },
      { name: 'تاريخ النشر', value: `<t:${Math.floor(video.publishedAt / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'FX9 Notifier' })
    .setTimestamp();
}

export function kickEmbed(stream) {
  const embed = new EmbedBuilder()
    .setColor(PLATFORM.kick.color)
    .setAuthor({ name: stream.channelName || PLATFORM.kick.name, iconURL: stream.channelAvatar || PLATFORM.kick.logo })
    .setTitle('🔴 Live Now on Kick!')
    .setURL(stream.url)
    .setDescription(`### [${stream.title}](${stream.url})`)
    .setThumbnail(PLATFORM.kick.logo)
    .addFields(
      { name: 'Channel', value: `[${stream.channelName}](https://kick.com/${stream.slug})`, inline: true },
      { name: 'Viewers', value: String(stream.viewerCount ?? 0), inline: true },
    );
  if (stream.category) embed.addFields({ name: 'Game', value: stream.category, inline: true });
  if (stream.thumbnail) embed.setImage(stream.thumbnail);
  embed.setFooter({ text: 'FX9 Notifier' }).setTimestamp();
  return embed;
}

export function twitterEmbed(tweet) {
  return new EmbedBuilder()
    .setColor(PLATFORM.twitter.color)
    .setAuthor({ name: PLATFORM.twitter.name, iconURL: PLATFORM.twitter.logo })
    .setTitle('تغريدة جديدة')
    .setDescription(tweet.text?.slice(0, 2000) || '')
    .setURL(tweet.url)
    .setThumbnail(tweet.channelAvatar)
    .setFooter({ text: 'FX9 Notifier' })
    .setTimestamp();
}
