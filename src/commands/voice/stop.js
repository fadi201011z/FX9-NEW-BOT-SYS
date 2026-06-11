import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('إيقاف الموسيقى وتفريغ القائمة');

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue?.connection) {
    return interaction.reply({ content: '❌ البوت ليس في قناة صوتية.', ephemeral: true });
  }

  if (queue._idleTimer) clearTimeout(queue._idleTimer);
  queue.connection.destroy();
  client.musicQueues.delete(interaction.guildId);

  await interaction.reply({ embeds: [new EmbedBuilder().setDescription('⏹️ تم إيقاف الموسيقى وتفريغ القائمة.').setColor(0xed4245)] });
}
