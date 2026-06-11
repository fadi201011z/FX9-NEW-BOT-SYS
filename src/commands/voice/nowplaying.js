import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { buildNowPlayingEmbed, getElapsed } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('عرض المقطع الحالي');

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue?.current || !queue.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  const embed = buildNowPlayingEmbed(queue, getElapsed(queue));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
