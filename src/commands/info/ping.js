import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('فحص زمن استجابة البوت والاتصال');

export async function execute(interaction) {
  const reply    = await interaction.reply({ content: '⏱️ جاري القياس...', withResponse: true });
  const sent     = reply.resource.message;
  const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
  const wsLatency = interaction.client.ws.ping;

  const color      = roundtrip < 100 ? Colors.SUCCESS : roundtrip < 250 ? Colors.WARNING : Colors.ERROR;
  const statusText = roundtrip < 100 ? '🟢 ممتاز' : roundtrip < 250 ? '🟡 جيد' : '🔴 ضعيف';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🏓  Pong!')
    .addFields(
      { name: '📡  الاستجابة الكاملة', value: `\`${roundtrip}ms\``,  inline: true },
      { name: '💓  نبضة WebSocket',    value: `\`${wsLatency}ms\``,  inline: true },
      { name: '🟢  الحالة',            value: statusText,             inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  فحص الاتصال' });

  await interaction.editReply({ content: null, embeds: [embed] });
}
