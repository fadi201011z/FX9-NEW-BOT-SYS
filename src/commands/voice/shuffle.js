import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('خلط قائمة التشغيل عشوائياً');

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue || queue.tracks.length < 2) {
    return interaction.reply({ content: '❌ القائمة تحتاج إلى مقطعين على الأقل للخلط.', ephemeral: true });
  }

  for (let i = queue.tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
  }

  await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔀 تم خلط القائمة عشوائياً!').setColor(0x5865f2)] });
}
