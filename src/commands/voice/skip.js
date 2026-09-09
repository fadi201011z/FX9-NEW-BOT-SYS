import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('تخطي المقطع الحالي');

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session?.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  const track = session.current;
  session.skip();

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setDescription(`⏭️ تم تخطي **${track?.title || 'المقطع'}**.`)
      .setColor(0xfee75c)],
  });
}