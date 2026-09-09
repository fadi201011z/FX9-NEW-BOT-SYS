import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { sessionFromInteraction } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('حذف مقطع من قائمة التشغيل')
  .addIntegerOption(o =>
    o.setName('position').setDescription('رقم المقطع في القائمة').setMinValue(1).setRequired(true)
  );

export async function execute(interaction, client) {
  const session = sessionFromInteraction(interaction);
  const position = interaction.options.getInteger('position', true);

  if (!session || !session.tracks.length) {
    return interaction.reply({ content: '❌ القائمة فارغة.', ephemeral: true });
  }
  if (position > session.tracks.length) {
    return interaction.reply({ content: `❌ القائمة تحتوي فقط على ${session.tracks.length} مقاطع.`, ephemeral: true });
  }

  const removed = session.removeAt(position);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setDescription(`🗑️ تم حذف **${removed?.title || 'المقطع'}** من القائمة.`)
      .setColor(0xed4245)],
  });

  session.refresh().catch(() => {});
}