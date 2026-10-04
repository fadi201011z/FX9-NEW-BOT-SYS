import { SlashCommandBuilder } from 'discord.js';
import { notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Show where a member sits in the join order')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to check (omit for yourself)'));

export async function execute(interaction) {
  await interaction.deferReply();

  const member = interaction.options.getMember('user') ?? interaction.member;
  const { user } = member;

  // Without this the ordering only reflects whichever members are cached.
  await interaction.guild.members.fetch().catch(() => {});

  // Oldest join first. Bots and members with no join date are excluded, so
  // the rank always refers to the same population.
  const ordered = interaction.guild.members.cache
    .filter((m) => !m.user.bot && m.joinedTimestamp)
    .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

  const total = ordered.size;
  const index = [...ordered.keys()].indexOf(member.id);

  if (index === -1) {
    return interaction.editReply({
      content: 'That member is not in the join order — they may be a bot, or they joined before the bot could see them.',
    });
  }

  const rank       = index + 1;
  const list       = [...ordered.values()];
  const percentile = (rank / total) * 100;

  const badge = rank === 1
    ? '👑 First member to join'
    : rank <= 10
      ? '🏆 Among the 10 earliest members'
      : rank <= Math.ceil(total * 0.1)
        ? '⭐ Among the oldest 10% of members'
        : '👤 Member';

  const joined = member.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
    : 'Unknown';

  await interaction.editReply({
    embeds: [notice({
      title: '📊 Join rank',
      color: rank <= 10 ? C.gold : C.info,
      thumbnail: user.displayAvatarURL({ dynamic: true, size: 512 }),
      description: badge,
      fields: [
        field('👤 Member', `${member}`),
        field('🏅 Rank', `#${rank} of ${total}`),
        field('📊 Older than', `${(100 - percentile).toFixed(1)}% of members`),
        field('📅 Joined', joined),
        field('⬆️ Joined just before', list[index - 1] ? `${list[index - 1]}` : '— Nobody — they are first'),
        field('⬇️ Joined just after', list[index + 1] ? `${list[index + 1]}` : '— Nobody — they are last'),
      ],
      footer: 'Kratos System • Join order',
      timestamp: true,
    })],
  });
}