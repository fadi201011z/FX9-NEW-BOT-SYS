import { SlashCommandBuilder } from 'discord.js';
import { notice, field, userTag, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription('View a member’s avatar at the highest available quality')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to view (omit for yourself)'));

export async function execute(interaction) {
  const member = interaction.options.getMember('user') ?? interaction.member;
  const { user } = member;

  // A per-server avatar takes priority, so `displayAvatarURL` is the one to
  // show; the global avatar is the fallback and the download source.
  const serverAvatar = member.displayAvatarURL({ dynamic: true, size: 4096 });
  const globalAvatar = user.displayAvatarURL({ dynamic: true, size: 4096 });
  const hasServerAvatar = serverAvatar !== globalAvatar;
  const isAnimated = serverAvatar.endsWith('.gif') || globalAvatar.endsWith('.gif');

  const formats = [`[PNG](${user.displayAvatarURL({ format: 'png', size: 4096 })})`];
  formats.push(`[WebP](${user.displayAvatarURL({ format: 'webp', size: 4096 })})`);
  formats.push(`[JPG](${user.displayAvatarURL({ format: 'jpg', size: 4096 })})`);
  if (isAnimated) formats.push(`[GIF](${serverAvatar})`);

  await interaction.reply({
    embeds: [notice({
      title: `🖼️ ${userTag(user)}`,
      color: C.neutral,
      image: serverAvatar,
      thumbnail: globalAvatar,
      fields: [
        field('💾 Download', formats.join(' · '), false),
        // Worth saying explicitly, because "avatar" and "profile picture" are
        // different pictures when a server avatar is set.
        ...(hasServerAvatar
          ? [field('🌐 Global avatar', `This member uses a server-specific avatar. The account avatar is [here](${globalAvatar}).`, false)]
          : []),
      ],
      footer: 'Kratos System • Avatar',
      timestamp: true,
    })],
  });
}