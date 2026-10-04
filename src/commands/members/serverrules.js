import { SlashCommandBuilder } from 'discord.js';
import { notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('rules')
  .setDescription('Show the server rules');

/**
 * Discord allows 1024 characters per field and 25 fields per embed, so the
 * list is chunked rather than assumed to fit.
 */
const RULES = [
  ['1️⃣ Mutual respect', 'Treat every member with respect, whatever their opinion or background.'],
  ['2️⃣ No harassment', 'No insults, no harassment, no hate speech of any kind.'],
  ['3️⃣ No advertising', 'No promotional links or server invites without staff approval.'],
  ['4️⃣ No spam', 'No repeated messages, no mass mentions, no unsolicited DMs.'],
  ['5️⃣ Use the right channel', 'Post in the channel meant for that kind of content.'],
  ['6️⃣ Follow staff instructions', 'Moderator decisions are final during a conversation.'],
];

const PER_FIELD = 1024;

export async function execute(interaction) {
  const guild = interaction.guild;

  const fields = [];
  let chunk = [];
  let size = 0;

  for (const [name, value] of RULES) {
    const line = `**${name}**\n${value}`;
    if (chunk.length && size + line.length + 1 > PER_FIELD - 20) {
      fields.push(field(`Rules ${fields.length + 1}`, chunk.join('\n\n'), false));
      chunk = [];
      size = 0;
    }
    chunk.push(line);
    size += line.length + 2;
  }
  if (chunk.length) fields.push(field(`Rules ${fields.length + 1}`, chunk.join('\n\n'), false));

  await interaction.reply({
    embeds: [notice({
      title: `📜 Rules — ${guild.name}`,
      color: C.error,
      thumbnail: guild.iconURL({ dynamic: true }),
      description: 'Please read these before posting. Breaking them leads to a warning, '
        + 'then to a timeout or a ban.',
      fields,
      footer: `Kratos System • ${guild.name}`,
      timestamp: true,
    })],
  });
}