import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors, COLOR, footer } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, clearAdminOverwrites } from '../../config/roles.js';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('فتح قناة مغلقة والسماح للأعضاء بالإرسال فيها')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة المراد فتحها (الافتراضي: الحالية)')
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.unlock)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;

  const everyoneRole = interaction.guild.roles.everyone;
  const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

  if (!currentPermissions || !currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({
      content: `⚠️ القناة ${channel} مفتوحة بالفعل ولا تحتاج لإعادة فتح.`,
      ephemeral: true
    });
  }

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
  await clearAdminOverwrites(channel, interaction.guild);

  const embed = new EmbedBuilder()
    .setColor(COLOR.white)
    .setTitle('🔓  فتح القناة')
    .setDescription([
      '```ansi',
      `\u001b[1;37m🔓  تم فتح القناة  │  ${channel.name}\u001b[0m`,
      '```',
      `${DIV}`,
      '',
      `**🛡️ بواسطة**  ─  ${interaction.user}`,
      '',
      `${DIV}`,
      '',
      '> جميع الأعضاء يستطيعون الإرسال الآن',
    ].join('\n'))
    .setFooter(footer('FX9 • إدارة القنوات'))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.white)
          .setTitle('🔓  تم فتح هذه القناة')
          .setDescription([
            '```ansi',
            `\u001b[1;37m🔓  القناة مفتوحة  │  يمكن للأعضاء الإرسال الآن\u001b[0m`,
            '```',
            `${DIV}`,
            '',
            `**🛡️ بواسطة**  ─  ${interaction.user}`,
          ].join('\n'))
          .setFooter(footer('FX9 • إدارة القنوات'))
          .setTimestamp(),
      ],
    }).catch(() => {});
  }

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.white)
          .setTitle('🔓  سجل — فتح قناة')
          .setDescription([
            '```ansi',
            `\u001b[1;37m🔓  فتح  │  ${channel.name}\u001b[0m`,
            '```',
            `${DIV}`,
            '',
            `**📢 القناة**  ─  ${channel}`,
            `**🛡️ المشرف**  ─  ${interaction.user}`,
          ].join('\n'))
          .setFooter(footer('FX9 • سجلات الإشراف'))
          .setTimestamp(),
      ],
    }).catch(() => {});
  }
}
