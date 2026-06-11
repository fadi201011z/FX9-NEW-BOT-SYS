import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { errorEmbed, modEmbed, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('طرد عضو من السيرفر مع إرسال إشعار له')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption(opt => opt.setName('user').setDescription('العضو المراد طرده').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('سبب الطرد'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.kick)) return;

  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason') ?? 'لم يُذكر سبب';

  if (!target) return interaction.reply({ embeds: [errorEmbed('العضو غير موجود', 'هذا العضو ليس في السيرفر.')], flags: EPHEMERAL });
  if (!canModerate(interaction.guild, target)) return interaction.reply({ embeds: [errorEmbed('لا يمكن طرده', 'لا أستطيع طرد هذا العضو بسبب ترتيب الأدوار.')], flags: EPHEMERAL });

  try {
    await target.send({
      embeds: [errorEmbed(`تم طردك من ${interaction.guild.name}`, `**السبب:** ${reason}\n**المشرف:** ${interaction.user.tag}`).setThumbnail(interaction.guild.iconURL({ dynamic: true }))],
    });
  } catch { /* DMs مغلقة */ }

  await target.kick(`${interaction.user.tag}: ${reason}`);

  await interaction.reply({
    embeds: [
      modEmbed('تم طرد العضو', target.user, interaction.user, reason)
        .setColor(0xf39c12).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
    ],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        modEmbed('👢 تنفيذ الطرد', target.user, interaction.user, reason, { '🆔  معرّف العضو': target.user.id })
          .setColor(0xf39c12).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      ],
    }).catch(() => {});
  }
}
