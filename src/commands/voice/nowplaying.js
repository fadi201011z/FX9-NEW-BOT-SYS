import { SlashCommandBuilder } from 'discord.js';
import { sessionFromInteraction, buildNowPlayingEmbed } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('عرض المقطع الحالي');

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session?.current || !session.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  const embed = buildNowPlayingEmbed(session);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}