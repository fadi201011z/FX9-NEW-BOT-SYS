import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('تخطي المقطع الحالي');

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue?.player || !queue.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  const track = queue.current;
  queue.player.stop();

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setDescription(`⏭️ تم تخطي **${track?.title || 'المقطع'}**.`)
      .setColor(0xfee75c)],
  });
}
