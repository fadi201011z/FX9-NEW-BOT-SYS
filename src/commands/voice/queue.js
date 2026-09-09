import { SlashCommandBuilder } from 'discord.js';
import { sessionFromInteraction, buildQueueEmbed } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('عرض قائمة التشغيل')
  .addIntegerOption(o => o.setName('page').setDescription('رقم الصفحة').setMinValue(1));

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session || (!session.tracks.length && !session.current)) {
    return interaction.reply({ content: '❌ القائمة فارغة.', ephemeral: true });
  }

  const page = Math.max(0, (interaction.options.getInteger('page') || 1) - 1);
  const embed = buildQueueEmbed(session, page);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}