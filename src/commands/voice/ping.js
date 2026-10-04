import { SlashCommandBuilder } from 'discord.js';
import { notice, field } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('vping')
  .setDescription('Check the voice service latency');

export async function execute(interaction, client) {
  const reply = await interaction.reply({ content: 'Measuring…', withResponse: true });

  const latency = reply.resource.message.createdTimestamp - interaction.createdTimestamp;
  const ws      = client.ws.ping;

  // One bar for both numbers — they track each other closely enough that
  // splitting them into separate statuses only adds noise.
  const rank = Math.max(latency, ws);
  const color = rank < 100 ? 0x22c55e : rank < 250 ? 0xf59e0b : 0xef4444;
  const bar   = rank < 100 ? '🟢' : rank < 250 ? '🟡' : '🔴';

  await interaction.editReply({
    content: null,
    embeds: [notice({
      title: '🏓 Pong!',
      color,
      fields: [
        field('Response', `${bar} \`${latency} ms\``),
        field('WebSocket', `${bar} \`${ws} ms\``),
      ],
      footer: 'KRS-VOICE v3.0',
      timestamp: true,
    })],
  });
}