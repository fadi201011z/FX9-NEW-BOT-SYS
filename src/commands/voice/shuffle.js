import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('خلط قائمة التشغيل عشوائياً');

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session || session.tracks.length < 2) {
    return interaction.reply({ content: '❌ القائمة تحتاج إلى مقطعين على الأقل للخلط.', ephemeral: true });
  }

  session.shuffle();

  await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔀 تم خلط القائمة عشوائياً!').setColor(0x5865f2)] });

  session.refresh().catch(() => {});
}