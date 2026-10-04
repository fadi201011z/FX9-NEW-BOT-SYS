import { SlashCommandBuilder } from 'discord.js';
import { notice, field, C } from '../../utils/embeds.js';
import { formatDuration } from '../../utils/parseDuration.js';
import { commandModules } from '../../config/commandLoader.js';
import process from 'node:process';

export const data = new SlashCommandBuilder()
  .setName('sysinfo')
  .setDescription('Detailed information about the bot and its runtime');

/** Shows only the first and last four digits of an id. */
function maskId(id) {
  if (!id || id.length < 9) return '●●●●●●●●●●';
  return `${id.slice(0, 4)}●●●●●●●●${id.slice(-4)}`;
}

export async function execute(interaction) {
  await interaction.deferReply();

  const client = interaction.client;

  const totalMembers  = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
  const totalChannels = client.channels.cache.size;
  const mem           = process.memoryUsage();
  const commandCount  = (await commandModules())
    .filter((m) => typeof m.mod.execute === 'function').length;

  const devName = process.env.BOT_DEVELOPER || 'Guardian Dev Team';
  const devId   = process.env.BOT_DEVELOPER_ID || null;

  await interaction.editReply({
    embeds: [notice({
      title: '🤖 Kratos System — bot information',
      color: C.info,
      thumbnail: client.user.displayAvatarURL({ dynamic: true, size: 512 }),
      fields: [
        field('🏷️ Name', `\`${client.user.username}\``),
        field('🆔 ID', `\`${maskId(client.user.id)}\``),
        field('📅 Created', `<t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`),
        field('⏱️ Uptime', `\`${formatDuration(client.uptime ?? 0)}\``),
        field('💓 Gateway latency', `\`${Math.round(client.ws.ping)} ms\``),
        field('💾 Memory', `\`${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB\` heap · \`${(mem.rss / 1024 / 1024).toFixed(1)} MB\` total`),
        field('🌐 Servers', `\`${client.guilds.cache.size}\``),
        field('👥 Cached members', `\`${totalMembers}\``),
        field('📢 Cached channels', `\`${totalChannels}\``),
        field('⚙️ Commands', `\`${commandCount}\``),
        field('📦 discord.js', `\`v${client.version}\``),
        field('🟢 Node.js', `\`${process.version}\``),
        field('👨‍💻 Developer', devId ? `${devName}\n\`${maskId(devId)}\`` : devName, false),
      ],
      footer: 'Kratos System • Bot information',
      timestamp: true,
    })],
  });
}