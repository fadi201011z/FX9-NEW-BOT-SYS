import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { notice, field, userTag, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Detailed information about this server');

const VERIFICATION = ['None', 'Low', 'Medium', 'High', 'Highest'];
const FEATURES = [
  ['ANIMATED_ICON', 'Animated icon'],
  ['BANNER', 'Banner'],
  ['COMMUNITY', 'Community'],
  ['DISCOVERABLE', 'Discoverable'],
  ['FEATURABLE', 'Featured'],
  ['INVITE_SPLASH', 'Invite splash'],
  ['NEWS', 'News'],
  ['PARTNERED', 'Partnered'],
  ['VANITY_URL', 'Custom URL'],
  ['VERIFIED', 'Verified'],
  ['WELCOME_SCREEN_ENABLED', 'Welcome screen'],
];

export async function execute(interaction) {
  await interaction.deferReply();

  const guild = interaction.guild;
  // Without this the human/bot split below is just the cached subset.
  await guild.members.fetch().catch(() => {});

  const owner    = await guild.fetchOwner().catch(() => null);
  const members  = guild.members.cache;
  const channels = guild.channels.cache;

  const count = (type) => channels.filter((c) => c.type === type).size;
  const features = FEATURES.filter(([f]) => guild.features.has(f)).map(([, label]) => label);

  const embed = notice({
    title: `🏠 ${guild.name}`,
    color: C.info,
    thumbnail: guild.iconURL({ dynamic: true, size: 512 }),
    fields: [
      field('👑 Owner', owner ? userTag(owner.user) : 'Unknown'),
      field('🆔 Server ID', `\`${guild.id}\``),
      field('📅 Created', `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`),
      field('👥 Members', `${guild.memberCount}`),
      field('🧑 Humans', `${members.filter((m) => !m.user.bot).size}`),
      field('🤖 Bots', `${members.filter((m) => m.user.bot).size}`),
      field('💬 Text channels', `${count(ChannelType.GuildText)}`),
      field('🎤 Voice channels', `${count(ChannelType.GuildVoice)}`),
      field('📁 Categories', `${count(ChannelType.GuildCategory)}`),
      field('🏷️ Roles', `${guild.roles.cache.size - 1}`),
      field('🔐 Verification', VERIFICATION[guild.verificationLevel] ?? 'Unknown'),
      field('✨ Boosts', `Tier ${guild.premiumTier ?? 0} · ${guild.premiumSubscriptionCount ?? 0}`),
      field('🎁 Features', features.length ? features.join(' · ') : 'None', false),
    ],
    footer: 'Kratos System • Server information',
    timestamp: true,
  });

  if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));

  await interaction.editReply({ embeds: [embed] });
}