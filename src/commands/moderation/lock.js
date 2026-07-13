import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors, COLOR, footer } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, grantAdminAccess } from '../../config/roles.js';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export const data = new SlashCommandBuilder()
  .setName('lock')
  .setDescription('إغلاق قناة ومنع الأعضاء من الإرسال فيها')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('القناة المراد إغلاقها (الافتراضي: القناة الحالية)')
      .addChannelTypes(ChannelType.GuildText)
  )
  .addStringOption(opt => opt.setName('reason').setDescription('سبب الإغلاق'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.lock)) return;

  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  const reason  = interaction.options.getString('reason') ?? 'لم يُذكر سبب';

  const everyoneRole = interaction.guild.roles.everyone;
  const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

  if (currentPermissions && currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({
      content: `⚠️ القناة ${channel} مقفلة بالفعل!`,
      ephemeral: true
    });
  }

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
  await grantAdminAccess(channel, interaction.guild, { ViewChannel: true, SendMessages: true });

  const embed = new EmbedBuilder()
    .setColor(COLOR.red)
    .setTitle('🔒  قفل القناة')
    .setDescription([
      '```ansi',
      `\u001b[1;31m🔒  تم تأمين القناة  │  ${channel.name}\u001b[0m`,
      '```',
      `${DIV}`,
      '',
      `**📋 السبب**  ─  ${reason}`,
      `**🛡️ بواسطة**  ─  ${interaction.user}`,
      '',
      `${DIV}`,
      '',
      '> الرتب الإدارية لا تزال قادرة على الإرسال بشكل طبيعي',
    ].join('\n'))
    .setFooter(footer('FX9 • إدارة القنوات'))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.red)
          .setTitle('🔒  تم قفل هذه القناة')
          .setDescription([
            '```ansi',
            `\u001b[1;31m⛔  القناة مغلقة  │  الأعضاء لا يستطيعون الإرسال\u001b[0m`,
            '```',
            `${DIV}`,
            '',
            `**📋 السبب**  ─  ${reason}`,
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
          .setColor(COLOR.red)
          .setTitle('🔒  سجل — قفل قناة')
          .setDescription([
            '```ansi',
            `\u001b[1;31m🔒  قفل  │  ${channel.name}\u001b[0m`,
            '```',
            `${DIV}`,
            '',
            `**📢 القناة**  ─  ${channel}`,
            `**🛡️ المشرف**  ─  ${interaction.user}`,
            `**📋 السبب**  ─  ${reason}`,
          ].join('\n'))
          .setFooter(footer('FX9 • سجلات الإشراف'))
          .setTimestamp(),
      ],
    }).catch(() => {});
  }
}
