import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('ضبط مستوى الصوت')
  .addIntegerOption(o =>
    o.setName('level').setDescription('مستوى الصوت (1-150)').setMinValue(1).setMaxValue(150).setRequired(true)
  );

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session?.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  const level = interaction.options.getInteger('level', true);
  session.setVolume(level);

  const bar = '🔊'.repeat(Math.ceil(level / 15)) + '🔉'.repeat(10 - Math.ceil(level / 15));
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setDescription(`🔊 تم ضبط الصوت إلى **${level}%**\n${bar}`)
      .setColor(0x5865f2)],
  });

  session.refresh().catch(() => {});
}