import { SlashCommandBuilder, PermissionsBitField, ChannelType, EmbedBuilder } from 'discord.js';

const ANNOUNCE_COLORS = {
  blue:   0x3b82f6,
  red:    0xef4444,
  gold:   0xfbbf24,
  green:  0x22c55e,
  black:  0x1e293b,
  purple: 0x8b5cf6,
  orange: 0xf59e0b,
};

const COLOR_LABEL = {
  blue: 'Blue', red: 'Red', gold: 'Gold',
  green: 'Green', black: 'Black', purple: 'Purple', orange: 'Orange',
};

// The type also decides the default colour, so `/announce type:warning` with
// no `color` option still comes out red.
const ANNOUNCE_TYPES = {
  general:     { emoji: '📢', label: 'Announcement', color: ANNOUNCE_COLORS.blue },
  maintenance: { emoji: '🔧', label: 'Maintenance',  color: ANNOUNCE_COLORS.orange },
  update:      { emoji: '✅', label: 'Update',       color: ANNOUNCE_COLORS.green },
  warning:     { emoji: '🚨', label: 'Warning',      color: ANNOUNCE_COLORS.red },
  rules:       { emoji: '📋', label: 'Rules',        color: ANNOUNCE_COLORS.purple },
};

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('📢 Send a formatted announcement')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)

  .addStringOption((o) => o.setName('title').setDescription('📌 Headline').setRequired(true).setMaxLength(200))
  .addStringOption((o) => o.setName('message').setDescription('📝 Body text').setRequired(true).setMaxLength(2000))

  .addChannelOption((o) => o.setName('channel').setDescription('📣 Target channel (default: this one)').addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addStringOption((o) =>
    o.setName('mention').setDescription('📢 Who to notify?').setRequired(false)
      .addChoices(
        { name: '@everyone', value: 'everyone' },
        { name: '@here', value: 'here' },
        { name: 'No one', value: 'none' }))
  .addRoleOption((o) => o.setName('mention_role').setDescription('🏷️ Ping a specific role').setRequired(false))

  .addStringOption((o) =>
    o.setName('color').setDescription('🎨 Accent colour').setRequired(false)
      .addChoices(
        { name: '🔵 Blue', value: 'blue' },
        { name: '🔴 Red', value: 'red' },
        { name: '🟡 Gold', value: 'gold' },
        { name: '🟢 Green', value: 'green' },
        { name: '⚫ Black', value: 'black' },
        { name: '🟣 Purple', value: 'purple' },
        { name: '🟠 Orange', value: 'orange' }))
  .addStringOption((o) =>
    o.setName('type').setDescription('📋 Announcement type — also sets the default colour').setRequired(false)
      .addChoices(
        { name: '📢 Announcement', value: 'general' },
        { name: '🔧 Maintenance', value: 'maintenance' },
        { name: '✅ Update', value: 'update' },
        { name: '🚨 Warning', value: 'warning' },
        { name: '📋 Rules', value: 'rules' }))

  .addStringOption((o) => o.setName('image').setDescription('🖼️ Image URL — large banner').setRequired(false))
  .addStringOption((o) => o.setName('thumbnail').setDescription('🖼️ Image URL — small side image').setRequired(false))
  .addStringOption((o) => o.setName('footer').setDescription('📎 Custom footer text').setRequired(false).setMaxLength(100))
  .addBooleanOption((o) => o.setName('timestamp').setDescription('⏰ Show the time? (default: yes)').setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const title       = interaction.options.getString('title', true);
  const message     = interaction.options.getString('message', true);
  const target      = interaction.options.getChannel('channel') ?? interaction.channel;
  const colorKey    = interaction.options.getString('color');
  const mention     = interaction.options.getString('mention') ?? 'none';
  const mentionRole = interaction.options.getRole('mention_role');
  const image       = interaction.options.getString('image');
  const thumbnail   = interaction.options.getString('thumbnail');
  const footerText  = interaction.options.getString('footer');
  const type        = interaction.options.getString('type') ?? 'general';
  const showTime    = interaction.options.getBoolean('timestamp') ?? true;

  const typeInfo   = ANNOUNCE_TYPES[type] ?? ANNOUNCE_TYPES.general;
  const finalColor = colorKey ? ANNOUNCE_COLORS[colorKey] : typeInfo.color;

  const guildIcon = interaction.guild.iconURL() || undefined;
  const now = Math.floor(Date.now() / 1000);

  // The type used to be repeated four times per embed — in the author line, in
  // a blockquote, as a field, and again in the footer. Once is enough.
  const embed = new EmbedBuilder()
    .setColor(finalColor)
    .setAuthor({ name: `${interaction.guild.name} • ${typeInfo.label}`, iconURL: guildIcon })
    .setTitle(`${typeInfo.emoji}  ${title}`)
    .setDescription(message)
    .addFields(
      { name: 'Type', value: typeInfo.label, inline: true },
      { name: 'Posted by', value: interaction.user.username, inline: true },
      { name: 'Date', value: `<t:${now}:D>`, inline: true })
    .setFooter({ text: footerText ?? interaction.guild.name, iconURL: guildIcon });

  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (showTime) embed.setTimestamp();

  let content;
  if (mention === 'everyone') content = '@everyone';
  else if (mention === 'here') content = '@here';
  else if (mentionRole) content = `<@&${mentionRole.id}>`;

  await target.send({ content, embeds: [embed] });

  await interaction.editReply({
    content: `✅ Announcement sent to ${target} — ${typeInfo.label}`
      + `${colorKey ? ` · ${COLOR_LABEL[colorKey]}` : ''}`
      + `${content ? ` · ${content}` : ''}`,
  });
}