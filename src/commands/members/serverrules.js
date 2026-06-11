import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('rules')
  .setDescription('عرض قوانين السيرفر');

export async function execute(interaction) {
  const guild = interaction.guild;

  const embed = new EmbedBuilder()
    .setColor(Colors.RED)
    .setTitle(`📜  قوانين ${guild.name}`)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setDescription(
      'يرجى قراءة القوانين التالية والالتزام بها للحفاظ على بيئة إيجابية لجميع الأعضاء.'
    )
    .addFields(
      { name: '1️⃣  الاحترام المتبادل',    value: 'احترم جميع الأعضاء بصرف النظر عن آرائهم أو خلفياتهم.', inline: false },
      { name: '2️⃣  ممنوع الإساءة',         value: 'لا إهانات ولا تحرش ولا خطاب كراهية بأي شكل.', inline: false },
      { name: '3️⃣  ممنوع الإعلانات',       value: 'لا روابط دعائية أو دعوات سيرفرات دون إذن إداري.', inline: false },
      { name: '4️⃣  ممنوع السبام',           value: 'لا إرسال رسائل متكررة أو منشنات جماعية.', inline: false },
      { name: '5️⃣  استخدام القنوات الصحيحة', value: 'أرسل المحتوى في القناة المناسبة له.', inline: false },
      { name: '6️⃣  طاعة الإدارة',           value: 'اتبع تعليمات المشرفين والمديرين.', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `⚔️ FX9-SYS  •  قوانين ${guild.name}` });

  await interaction.reply({ embeds: [embed] });
}
