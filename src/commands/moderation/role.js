import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { errorEmbed, Colors, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('role')
  .setDescription('إضافة أو إزالة رتبة من عضو في السيرفر')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('إضافة رتبة لعضو')
      .addUserOption(opt => opt.setName('user').setDescription('العضو المستهدف').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد إضافتها').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('إزالة رتبة من عضو')
      .addUserOption(opt => opt.setName('user').setDescription('العضو المستهدف').setRequired(true))
      .addRoleOption(opt => opt.setName('role').setDescription('الرتبة المراد إزالتها').setRequired(true))
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.role)) return;

  const sub    = interaction.options.getSubcommand();
  const target = interaction.options.getMember('user');
  const role   = interaction.options.getRole('role');

  if (!target) return interaction.reply({ embeds: [errorEmbed('العضو غير موجود', 'هذا العضو ليس في السيرفر.')], flags: EPHEMERAL });
  if (role.position >= interaction.guild.members.me.roles.highest.position) {
    return interaction.reply({ embeds: [errorEmbed('الرتبة أعلى من رتبتي', 'لا أستطيع إدارة رتبة أعلى من رتبتي.')], flags: EPHEMERAL });
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));

  if (sub === 'add') {
    if (target.roles.cache.has(role.id)) {
      return interaction.reply({ embeds: [errorEmbed('يمتلك الرتبة مسبقاً', `${target} يمتلك بالفعل رتبة ${role}.`)], flags: EPHEMERAL });
    }
    await target.roles.add(role, `تمت الإضافة بواسطة ${interaction.user.tag}`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.WHITE)
          .setTitle('✅  تمت إضافة الرتبة')
          .addFields(
            { name: '👤  العضو',  value: `${target}`,          inline: true },
            { name: '🏷️  الرتبة', value: `${role}`,            inline: true },
            { name: '🛡️  بواسطة', value: `${interaction.user}`, inline: true },
          )
          .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  إدارة الأدوار' })
      ],
    });

    if (modLogCh) {
      await modLogCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.WHITE)
            .setTitle('🏷️  إضافة رتبة')
            .addFields(
              { name: '👤  العضو',  value: `${target}\n\`${target.user.id}\``, inline: true },
              { name: '🏷️  الرتبة', value: `${role}`,                         inline: true },
              { name: '🛡️  المشرف', value: `${interaction.user}`,             inline: true },
            )
            .setTimestamp()
            .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
        ],
      }).catch(() => {});
    }
  }

  if (sub === 'remove') {
    if (!target.roles.cache.has(role.id)) {
      return interaction.reply({ embeds: [errorEmbed('لا يمتلك الرتبة', `${target} لا يمتلك رتبة ${role}.`)], flags: EPHEMERAL });
    }
    await target.roles.remove(role, `تمت الإزالة بواسطة ${interaction.user.tag}`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.RED)
          .setTitle('❌  تمت إزالة الرتبة')
          .addFields(
            { name: '👤  العضو',  value: `${target}`,          inline: true },
            { name: '🏷️  الرتبة', value: `${role}`,            inline: true },
            { name: '🛡️  بواسطة', value: `${interaction.user}`, inline: true },
          )
          .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  إدارة الأدوار' })
      ],
    });

    if (modLogCh) {
      await modLogCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.RED)
            .setTitle('🏷️  إزالة رتبة')
            .addFields(
              { name: '👤  العضو',  value: `${target}\n\`${target.user.id}\``, inline: true },
              { name: '🏷️  الرتبة', value: `${role}`,                         inline: true },
              { name: '🛡️  المشرف', value: `${interaction.user}`,             inline: true },
            )
            .setTimestamp()
            .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
        ],
      }).catch(() => {});
    }
  }
}
