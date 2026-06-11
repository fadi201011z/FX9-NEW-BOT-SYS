import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/embeds.js';
import { formatDuration } from '../../utils/parseDuration.js';
import process from 'node:process';

export const data = new SlashCommandBuilder()
  .setName('sysinfo')
  .setDescription('معلومات تفصيلية عن البوت والإحصائيات');

/** إخفاء جزء من المعرّف — يُظهر أول 4 وآخر 4 فقط */
function maskId(id) {
  if (!id || id.length < 9) return '●●●●●●●●●●';
  return id.slice(0, 4) + '●●●●●●●●' + id.slice(-4);
}

export async function execute(interaction) {
  const client = interaction.client;
  const uptime = formatDuration(client.uptime ?? 0);

  const totalMembers  = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const totalChannels = client.channels.cache.size;
  const memRaw        = process.memoryUsage();
  const heapMB        = (memRaw.heapUsed  / 1024 / 1024).toFixed(1);
  const rssMB         = (memRaw.rss       / 1024 / 1024).toFixed(1);

  // بيانات المطور من ملف .env
  const devName = process.env.BOT_DEVELOPER    ?? 'Guardian Dev Team';
  const devId   = process.env.BOT_DEVELOPER_ID ?? null;
  const devValue = devId ? `${devName}\n\`${maskId(devId)}\`` : devName;

  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle('🤖 FX9-SYS — معلومات النظام')
    .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      // ─── قسم البوت ───────────────────────────────────────────────────────
      { name: '🏷️  الاسم',         value: `\`${client.user.username}\``,    inline: true },
      { name: '🆔  المعرّف',        value: `\`${maskId(client.user.id)}\``,  inline: true },
      { name: '📅  تاريخ الإنشاء',  value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`, inline: true },
      // ─── قسم الأداء ──────────────────────────────────────────────────────
      { name: '⏱️  وقت التشغيل',   value: `\`${uptime}\``,                   inline: true },
      { name: '💓  تأخر WS',        value: `\`${client.ws.ping}ms\``,         inline: true },
      { name: '💾  الذاكرة',        value: `\`${heapMB} MB / ${rssMB} MB\``,  inline: true },
      // ─── قسم الإحصائيات ──────────────────────────────────────────────────
      { name: '🌐  السيرفرات',      value: `\`${client.guilds.cache.size}\``,  inline: true },
      { name: '👥  إجمالي الأعضاء', value: `\`${totalMembers}\``,             inline: true },
      { name: '📢  القنوات',        value: `\`${totalChannels}\``,             inline: true },
      { name: '⚙️  الأوامر',        value: `\`${client.commands?.size ?? 0}\``, inline: true },
      { name: '📦  discord.js',     value: '`v14`',                            inline: true },
      { name: '🟢  Node.js',        value: `\`${process.version}\``,           inline: true },
      // ─── قسم المطور ──────────────────────────────────────────────────────
      { name: '👨‍💻  المطور',         value: devValue,                           inline: false },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  معلومات النظام' });

  await interaction.reply({ embeds: [embed] });
}
