import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { errorEmbed, modEmbed, EPHEMERAL } from '../../utils/embeds.js';
import { parseDuration, formatDuration } from '../../utils/parseDuration.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('إيقاف عضو مؤقتاً لمدة محددة (كتم)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(opt => opt.setName('user').setDescription('العضو المراد إيقافه').setRequired(true))
  .addStringOption(opt => opt.setName('duration').setDescription('المدة (مثال: 10m أو 1h أو 1d)').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('سبب الإيقاف'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.timeout)) return;

  const target      = interaction.options.getMember('user');
  const durationStr = interaction.options.getString('duration');
  const reason      = interaction.options.getString('reason') ?? 'لم يُذكر سبب';
  const durationMs  = parseDuration(durationStr);

  if (!target)     return interaction.reply({ embeds: [errorEmbed('العضو غير موجود', 'هذا العضو ليس في السيرفر.')], flags: EPHEMERAL });
  if (!durationMs) return interaction.reply({ embeds: [errorEmbed('مدة غير صالحة', 'أدخل مدة صحيحة. أمثلة: `10m` أو `1h` أو `2d`.')], flags: EPHEMERAL });
  if (durationMs > 28 * 24 * 60 * 60 * 1000) return interaction.reply({ embeds: [errorEmbed('المدة طويلة جداً', 'لا يمكن أن تتجاوز المدة **28 يوماً**.')], flags: EPHEMERAL });
  if (!canModerate(interaction.guild, target)) return interaction.reply({ embeds: [errorEmbed('لا يمكن الإيقاف', 'لا أستطيع إيقاف هذا العضو بسبب ترتيب الأدوار.')], flags: EPHEMERAL });

  const until = new Date(Date.now() + durationMs);
  await target.timeout(durationMs, `${interaction.user.tag}: ${reason}`);

  const extra = {
    '⏳  المدة':  formatDuration(durationMs),
    '🕐  ينتهي': `<t:${Math.floor(until.getTime() / 1000)}:R>`,
  };

  await interaction.reply({
    embeds: [modEmbed('تم الإيقاف المؤقت', target.user, interaction.user, reason, extra).setColor(0xf39c12).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [modEmbed('⏱️ تنفيذ الإيقاف', target.user, interaction.user, reason, { ...extra, '🆔  المعرّف': target.user.id }).setColor(0xf39c12)],
    }).catch(() => {});
  }
}
