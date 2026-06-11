import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { updateNowPlayingEmbed } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('إيقاف مؤقت أو استكمال الموسيقى');

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue?.player || !queue.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  if (queue._paused) {
    queue.player.unpause();
    queue._paused = false;
    queue._startTime = Date.now();
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription('▶️ تم الاستكمال.').setColor(0x57f287)] });
  } else {
    queue._elapsedBefore += Math.floor((Date.now() - queue._startTime) / 1000);
    queue.player.pause();
    queue._paused = true;
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription('⏸️ تم الإيقاف المؤقت.').setColor(0xfee75c)] });
  }

  updateNowPlayingEmbed(client, interaction.guildId);
}
