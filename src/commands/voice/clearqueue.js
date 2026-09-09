import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('clearqueue')
  .setDescription('تفريغ قائمة التشغيل');

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session || !session.tracks.length) {
    return interaction.reply({ content: '❌ القائمة فارغة بالفعل.', ephemeral: true });
  }
  session.tracks = [];
  await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🗑️ تم تفريغ قائمة التشغيل.').setColor(0x57f287)] });

  session.refresh().catch(() => {});
}