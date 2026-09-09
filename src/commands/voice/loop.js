import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('وضع التكرار')
  .addStringOption(o =>
    o.setName('mode').setDescription('وضع التكرار').setRequired(true).addChoices(
      { name: '🚫 بدون تكرار', value: 'none' },
      { name: '🔂 تكرار المقطع', value: 'track' },
      { name: '🔁 تكرار القائمة', value: 'queue' },
    )
  );

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  if (!session?.isPlaying) {
    return interaction.reply({ content: '❌ لا يوجد تشغيل نشط.', ephemeral: true });
  }

  const mode = interaction.options.getString('mode', true);
  session.loopMode = mode;

  const labels = { none: '🚫 بدون تكرار', track: '🔂 تكرار المقطع', queue: '🔁 تكرار القائمة' };
  await interaction.reply({
    embeds: [new EmbedBuilder().setDescription(`✅ تم تفعيل: **${labels[mode]}**`).setColor(0x57f287)],
  });

  session.refresh().catch(() => {});
}