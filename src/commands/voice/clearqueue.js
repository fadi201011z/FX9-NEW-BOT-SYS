import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('clearqueue')
  .setDescription('تفريغ قائمة التشغيل');

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue || !queue.tracks.length) {
    return interaction.reply({ content: '❌ القائمة فارغة بالفعل.', ephemeral: true });
  }
  queue.tracks = [];
  await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🗑️ تم تفريغ قائمة التشغيل.').setColor(0x57f287)] });
}
