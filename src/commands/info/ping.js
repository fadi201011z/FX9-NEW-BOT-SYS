import { SlashCommandBuilder } from 'discord.js';
import { notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Measure the bot’s response time and gateway latency');

/** Discord treats a round trip under 250 ms as unnoticeable to a user. */
const rating = (ms) => {
  if (ms < 100) return { label: '🟢 Excellent', color: C.ok };
  if (ms < 250) return { label: '🟡 Good', color: C.warn };
  return { label: '🔴 Slow', color: C.error };
};

export async function execute(interaction) {
  const reply     = await interaction.reply({ content: '⏱️ Measuring…', withResponse: true });
  const roundTrip = reply.resource.message.createdTimestamp - interaction.createdTimestamp;
  const gateway   = Math.round(interaction.client.ws.ping ?? 0);
  const { label, color } = rating(roundTrip);

  await interaction.editReply({
    // `content: null` clears the placeholder — sending only `embeds` would
    // leave "Measuring…" above the embed.
    content: null,
    embeds: [notice({
      title: '🏓 Pong!',
      color,
      fields: [
        field('📡 Round trip', `\`${roundTrip} ms\``),
        field('💓 Gateway', `\`${gateway} ms\``),
        field('🟢 Status', label),
      ],
      footer: 'Kratos System • Connection check',
      timestamp: true,
    })],
  });
}