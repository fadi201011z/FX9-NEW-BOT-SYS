import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vchelp')
  .setDescription('عرض أوامر الصوت والموسيقى');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎵 أوامر الصوت والموسيقى')
    .setDescription('**🎙️ القنوات الصوتية المؤقتة**\n`/setup` — إعداد النظام\n\n**🎵 الموسيقى (لوحة تحكم داخل شات الفويس)**\n`/play` — تشغيل والانضمام لقناتك\n`/search` — بحث واختيار\n`/pause` — إيقاف مؤقت\n`/skip` — تخطي\n`/stop` — إيقاف وخروج\n`/volume` — صوت\n`/loop` — تكرار\n`/queue` — قائمة\n`/nowplaying` — الحالي\n`/shuffle` — خلط\n`/remove` — حذف\n`/clearqueue` — تفريغ\n\n> 🔊 عند `/play` تُرسل **لوحة تحكم** داخل شات القناة الصوتية فيها: ▶️/⏸️ توقف، ⏭️ تخطي، ⏹️ خروج، 🔁 تكرار، 🔀 خلط، صوت +/‑، إرجاع/تقديم 10ث، و➕ إضافة أغنية. البوت يقبل التشغيل في **عدة قنوات صوتية في نفس الوقت**.')
    .setFooter({ text: 'FX9-VOICE v5.0' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
