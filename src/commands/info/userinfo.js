import { SlashCommandBuilder } from 'discord.js';
import { notice, field, userTag, C } from '../../utils/embeds.js';
import { getWarnings } from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Detailed information about a member')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to inspect (omit for yourself)'));

const BADGES = {
  Staff: '👨‍💼 Discord Staff',
  Partner: '🤝 Partner',
  Hypesquad: '🏠 HypeSquad Events',
  BugHunterLevel1: '🐛 Bug Hunter',
  BugHunterLevel2: '🐛 Golden Bug Hunter',
  HypeSquadOnlineHouse1: '🏠 Bravery',
  HypeSquadOnlineHouse2: '🏠 Brilliance',
  HypeSquadOnlineHouse3: '🏠 Balance',
  PremiumEarlySupporter: '⭐ Early Supporter',
  VerifiedDeveloper: '✅ Verified Bot Developer',
  ActiveDeveloper: '👨‍💻 Active Developer',
};

export async function execute(interaction) {
  const target = interaction.options.getMember('user') ?? interaction.member;
  const user   = target.user ?? target;

  const warnings = getWarnings(interaction.guildId, user.id) ?? [];
  const roles = (target.roles?.cache ?? new Map())
    .filter((r) => r.id !== interaction.guildId)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.toString())
    .slice(0, 15)
    .join(', ');

  const badges = (user.flags?.toArray() ?? [])
    .map((f) => BADGES[f])
    .filter(Boolean);

  const accountAge   = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
  const isNewAccount = accountAge < 7;

  const warnColor = warnings.length >= 3 ? C.error : warnings.length > 0 ? C.warn : C.ok;

  const fields = [
    field('🆔 ID', `\`${user.id}\``),
    field('🤖 Bot', user.bot ? 'Yes' : 'No'),
    field('🎨 Role colour', target.displayHexColor ?? 'None'),
    field('📅 Account created', `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`),
    field('📥 Joined server', target.joinedTimestamp
      ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`
      : 'Unknown'),
    field('⚠️ Warnings', `${warnings.length}`, false),
    field('🏷️ Roles', roles || 'None', false),
  ];

  if (badges.length > 0) fields.push(field('🏅 Badges', badges.join('\n'), false));

  if (isNewAccount) {
    fields.push(field(
      '⚠️ New account',
      `This account is only **${accountAge} day${accountAge === 1 ? '' : 's'}** old.`,
      false,
    ));
  }

  if (warnings.length > 0) {
    fields.push(field(
      '📋 Warning history',
      warnings.slice(-5).reverse()
        .map((w, i) => `${i + 1}. <t:${Math.floor((w.timestamp ?? 0) / 1000)}:d> — `
          + `${w.reason ?? 'No reason given'}${w.moderatorId ? ` · by <@${w.moderatorId}>` : ''}`)
        .join('\n')
        .slice(0, 1024),
      false,
    ));
  }

  await interaction.reply({
    embeds: [notice({
      title: `👤 ${userTag(user)}`,
      color: isNewAccount ? C.warn : C.info,
      thumbnail: user.displayAvatarURL({ dynamic: true, size: 512 }),
      fields,
      footer: warnColor === C.error
        ? 'Kratos System • Member information — 3 or more warnings'
        : 'Kratos System • Member information',
      timestamp: true,
    })],
  });
}