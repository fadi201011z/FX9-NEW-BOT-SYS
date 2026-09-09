import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('إيقاف الموسيقى وإخراج البوت من القناة');

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session?.connection) {
    return interaction.reply({ content: '❌ البوت ليس في قناة صوتية.', ephemeral: true });
  }

  await session.stop(true);

  await interaction.reply({ embeds: [new EmbedBuilder().setDescription('⏹️ تم إيقاف الموسيقى وخروج البوت من القناة.').setColor(0xed4245)] });
}