import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vchelp')
  .setDescription('عرض أوامر الصوت والموسيقى');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎵 أوامر الصوت والموسيقى')
    .setDescription('**🎙️ القنوات الصوتية المؤقتة**\n`/setup` — إعداد النظام\n\n**🎵 الموسيقى**\n`/play` — تشغيل\n`/search` — بحث\n`/pause` — إيقاف مؤقت\n`/skip` — تخطي\n`/stop` — إيقاف\n`/volume` — صوت\n`/loop` — تكرار\n`/queue` — قائمة\n`/nowplaying` — الحالي\n`/shuffle` — خلط\n`/remove` — حذف\n`/clearqueue` — تفريغ')
    .setFooter({ text: 'FX9-VOICE v3.0' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
