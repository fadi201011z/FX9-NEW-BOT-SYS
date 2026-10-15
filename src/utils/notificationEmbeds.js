import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const PLATFORM = {
  youtube: { name: 'YouTube', color: 0xff0000, logo: 'https://www.youtube.com/s/desktop/92a3e22b/img/favicon_144x144.png' },
  kick:    { name: 'Kick',    color: 0x44d614, logo: 'https://kick.com/favicon.ico' },
  twitter: { name: 'Twitter', color: 0x1da1f2, logo: 'https://abs.twimg.com/favicons/twitter.2.ico' },
};

export function youtubeEmbed(video) {
  const embed = new EmbedBuilder()
    .setColor(PLATFORM.youtube.color)
    .setTitle('📹 New video on YouTube')
    .setURL(video.url)
    .setDescription(`### [${video.title}](${video.url})`)
    .addFields(
      { name: 'Channel', value: `[${video.channelName}](https://www.youtube.com/channel/${video.channelId})`, inline: true },
      { name: 'Published', value: `<t:${Math.floor(video.publishedAt / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'KRS Notifier' })
    .setTimestamp();

  // The channel is the subject, so it leads the card — name and avatar together,
  // and the avatar is only attached when the RSS scrape actually found one.
  const author = { name: video.channelName || PLATFORM.youtube.name };
  if (video.channelAvatar) author.iconURL = video.channelAvatar;
  embed.setAuthor(author);

  if (video.thumbnail) embed.setImage(video.thumbnail);
  return embed;
}

// Link button under the YouTube embed: opens the new video.
export function youtubeComponents(video) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setEmoji('▶️')
      .setLabel('Watch on YouTube')
      .setURL(video.url),
  );
  return [row];
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
  embed.setFooter({ text: 'KRS Notifier' }).setTimestamp();
  return embed;
}

// Link button under the Kick embed: label = "Kick.com/<name>", opens the channel page.
export function kickComponents(stream) {
  const slug = String(stream.slug || '').trim();
  const channelUrl = slug ? `https://kick.com/${slug}` : stream.url;
  const handle = String(stream.channelName || slug || 'Watch on Kick').trim();
  const label = `Kick.com/${handle}`.slice(0, 80);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔗')
      .setLabel(label)
      .setURL(channelUrl),
  );
  return [row];
}

export function twitterEmbed(tweet) {
  return new EmbedBuilder()
    .setColor(PLATFORM.twitter.color)
    .setAuthor({ name: PLATFORM.twitter.name, iconURL: PLATFORM.twitter.logo })
    .setTitle('New post')
    .setDescription(tweet.text?.slice(0, 2000) || '')
    .setURL(tweet.url)
    .setThumbnail(tweet.channelAvatar)
    .setFooter({ text: 'KRS Notifier' })
    .setTimestamp();
}
