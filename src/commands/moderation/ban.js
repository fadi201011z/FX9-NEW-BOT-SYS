import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { errorEmbed, modEmbed, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('حظر عضو من السيرفر مع إرسال إشعار له')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(opt => opt.setName('user').setDescription('العضو المراد حظره').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('سبب الحظر'))
  .addIntegerOption(opt => opt.setName('delete_days').setDescription('حذف رسائله (0-7 أيام)').setMinValue(0).setMaxValue(7));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.ban)) return;

  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب';
  const days   = interaction.options.getInteger('delete_days') ?? 0;

  if (!target) return interaction.reply({ embeds: [errorEmbed('العضو غير موجود', 'هذا العضو ليس في السيرفر.')], flags: EPHEMERAL });
  if (!canModerate(interaction.guild, target)) return interaction.reply({ embeds: [errorEmbed('لا يمكن حظره', 'لا أستطيع حظر هذا العضو بسبب ترتيب الأدوار.')], flags: EPHEMERAL });

  try {
    await target.send({
      embeds: [errorEmbed(`تم حظرك من ${interaction.guild.name}`, `**السبب:** ${reason}\n**المشرف:** ${interaction.user.tag}`).setThumbnail(interaction.guild.iconURL({ dynamic: true }))],
    });
  } catch { /* DMs مغلقة */ }

  await target.ban({ reason: `${interaction.user.tag}: ${reason}`, deleteMessageDays: days });

  await interaction.reply({
    embeds: [
      modEmbed('تم حظر العضو', target.user, interaction.user, reason, { '📅  الرسائل المحذوفة': `${days} أيام` })
        .setColor(0xe74c3c).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
    ],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        modEmbed('🔨 تنفيذ الحظر', target.user, interaction.user, reason, {
          '🆔  معرّف العضو': target.user.id,
          '📅  الرسائل المحذوفة': `${days} أيام`,
        }).setColor(0xe74c3c).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      ],
    }).catch(() => {});
  }
}
