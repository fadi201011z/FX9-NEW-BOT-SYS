import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { requireRole, canModerate, getLogChannel } from '../../utils/permissions.js';
import { errorEmbed, Colors, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('nick')
  .setDescription('تغيير أو إعادة ضبط لقب عضو')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
  .addUserOption(opt => opt.setName('user').setDescription('العضو المستهدف').setRequired(true))
  .addStringOption(opt => opt.setName('nickname').setDescription('اللقب الجديد (اتركه فارغاً لإعادة الضبط)'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.nick)) return;

  const target   = interaction.options.getMember('user');
  const nickname = interaction.options.getString('nickname') ?? null;

  if (!target)                              return interaction.reply({ embeds: [errorEmbed('غير موجود', 'هذا العضو ليس في السيرفر.')],        flags: EPHEMERAL });
  if (!canModerate(interaction.guild, target)) return interaction.reply({ embeds: [errorEmbed('لا يمكن التعديل', 'لا أستطيع تعديل لقب هذا العضو.')], flags: EPHEMERAL });

  const oldNick = target.nickname ?? target.user.username;
  await target.setNickname(nickname, `بواسطة ${interaction.user.tag}`);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.WHITE)
        .setTitle('✏️  تم تغيير اللقب')
        .addFields(
          { name: '👤 العضو',   value: `${target}`,                       inline: false },
          { name: '📝 قبل',    value: oldNick,                            inline: true  },
          { name: '📝 بعد',    value: nickname ?? target.user.username,   inline: true  },
          { name: '🛡️ بواسطة', value: `${interaction.user}`,             inline: true  },
        )
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: '⚔️ FX9-SYS  •  إدارة الأعضاء' })
    ],
    flags: EPHEMERAL,
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.EDIT)
          .setTitle('✏️  تغيير لقب')
          .addFields(
            { name: '👤 العضو',   value: `${target} \`${target.user.id}\``, inline: false },
            { name: '📝 قبل',    value: oldNick,                            inline: true  },
            { name: '📝 بعد',    value: nickname ?? target.user.username,   inline: true  },
            { name: '🛡️ المشرف', value: `${interaction.user}`,             inline: true  },
          )
          .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' })
      ],
    }).catch(() => {});
  }
}
