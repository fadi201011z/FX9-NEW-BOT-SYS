import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('إيقاف مؤقت أو استكمال الموسيقى');

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session?.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  if (session._paused) {
    session.togglePause();
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription('▶️ تم الاستكمال.').setColor(0x57f287)] });
  } else {
    session.togglePause();
    await interaction.reply({ embeds: [new EmbedBuilder().setDescription('⏸️ تم الإيقاف المؤقت.').setColor(0xfee75c)] });
  }

  session.refresh().catch(() => {});
}