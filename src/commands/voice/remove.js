import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('حذف مقطع من قائمة التشغيل')
  .addIntegerOption(o =>
    o.setName('position').setDescription('رقم المقطع في القائمة').setMinValue(1).setRequired(true)
  );

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  const position = interaction.options.getInteger('position', true);

  if (!queue || !queue.tracks.length) {
    return interaction.reply({ content: '❌ القائمة فارغة.', ephemeral: true });
  }
  if (position > queue.tracks.length) {
    return interaction.reply({ content: `❌ القائمة تحتوي فقط على ${queue.tracks.length} مقاطع.`, ephemeral: true });
  }

  const removed = queue.tracks.splice(position - 1, 1)[0];
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setDescription(`🗑️ تم حذف **${removed.title}** من القائمة.`)
      .setColor(0xed4245)],
  });
}
