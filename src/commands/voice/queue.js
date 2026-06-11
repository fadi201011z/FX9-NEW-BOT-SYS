import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { formatTime } from '../../handlers/music.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('عرض قائمة التشغيل')
  .addIntegerOption(o => o.setName('page').setDescription('رقم الصفحة').setMinValue(1));

export async function execute(interaction, client) {
  const queue = client.musicQueues.get(interaction.guildId);
  if (!queue || (!queue.tracks.length && !queue.current)) {
    return interaction.reply({ content: '❌ القائمة فارغة.', ephemeral: true });
  }

  const page = interaction.options.getInteger('page') || 1;
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(queue.tracks.length / perPage));
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const pageTracks = queue.tracks.slice(start, end);

  const desc = pageTracks.length
    ? pageTracks.map((t, i) =>
      `**${start + i + 1}.** [${t.title}](${t.url}) — ${formatTime(t.durationSec)}`
    ).join('\n')
    : '—';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 قائمة التشغيل')
    .setDescription(desc)
    .setFooter({ text: `🎵 ${queue.tracks.length} مقطع • صفحة ${page}/${totalPages}` });

  if (queue.current) {
    embed.addFields({ name: '▶️ الحالي', value: `[${queue.current.title}](${queue.current.url}) — ${formatTime(queue.current.durationSec)}` });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
