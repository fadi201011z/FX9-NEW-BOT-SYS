import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { errorEmbed, warnEmbed, infoEmbed, EPHEMERAL } from '../../utils/embeds.js';
import { addWarning, getWarnings, clearWarnings, getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('نظام التحذيرات — إضافة أو عرض أو مسح تحذيرات الأعضاء')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('إضافة تحذير لعضو')
      .addUserOption(opt => opt.setName('user').setDescription('العضو المراد تحذيره').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('سبب التحذير').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('عرض تحذيرات عضو')
      .addUserOption(opt => opt.setName('user').setDescription('العضو المراد فحصه').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('clear')
      .setDescription('مسح جميع تحذيرات عضو')
      .addUserOption(opt => opt.setName('user').setDescription('العضو المراد مسح تحذيراته').setRequired(true))
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.warn)) return;

  const sub    = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user');

  if (sub === 'add') {
    const reason   = interaction.options.getString('reason');
    addWarning(interaction.guildId, target.id, interaction.user.id, reason);
    const warnings = getWarnings(interaction.guildId, target.id);

    try {
      await target.send({
        embeds: [
          warnEmbed(
            `تحذير من ${interaction.guild.name}`,
            `لقد تلقيت تحذيراً.\n\n**السبب:** ${reason}\n**إجمالي التحذيرات:** ${warnings.length}`
          ).setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        ],
      });
    } catch { /* DMs مغلقة */ }

    await interaction.reply({
      embeds: [
        warnEmbed('تم إصدار تحذير', `${target} تلقى تحذيراً.\n\n**السبب:** ${reason}\n**إجمالي التحذيرات:** ${warnings.length}`)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      ],
    });

    const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
    if (modLogCh) {
      await modLogCh.send({
        embeds: [
          warnEmbed('⚠️  تحذير صادر', null)
            .addFields(
              { name: '👤  العضو',          value: `${target} (\`${target.id}\`)`, inline: true },
              { name: '🛡️  المشرف',         value: `${interaction.user}`,          inline: true },
              { name: '📋  السبب',          value: reason,                         inline: false },
              { name: '📊  إجمالي التحذيرات', value: `${warnings.length}`,         inline: true },
            ).setThumbnail(target.displayAvatarURL({ dynamic: true }))
        ],
      }).catch(() => {});
    }
    return;
  }

  if (sub === 'list') {
    const warnings = getWarnings(interaction.guildId, target.id);
    if (warnings.length === 0) {
      return interaction.reply({ embeds: [infoEmbed('لا توجد تحذيرات', `${target} ليس لديه تحذيرات مسجّلة.`)], flags: EPHEMERAL });
    }
    const fields = warnings.slice(0, 10).map((w, i) => ({
      name:  `تحذير #${i + 1} — <t:${Math.floor(w.timestamp / 1000)}:D>`,
      value: `**السبب:** ${w.reason}\n**المشرف:** <@${w.moderatorId}>`,
    }));
    return interaction.reply({
      embeds: [warnEmbed(`تحذيرات ${target.tag}`, `الإجمالي: **${warnings.length}** تحذير`).addFields(fields).setThumbnail(target.displayAvatarURL({ dynamic: true }))],
      flags: EPHEMERAL,
    });
  }

  if (sub === 'clear') {
    clearWarnings(interaction.guildId, target.id);
    return interaction.reply({ embeds: [infoEmbed('تم مسح التحذيرات', `تم مسح جميع تحذيرات ${target}.`)], flags: EPHEMERAL });
  }
}
