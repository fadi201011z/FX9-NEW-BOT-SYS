import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, grantAdminAccess } from '../../config/roles.js';

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

  // 🛡️ التحقق مما إذا كانت القناة مقفلة بالفعل قبل التنفيذ
  const everyoneRole = interaction.guild.roles.everyone;
  const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

  if (currentPermissions && currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({ 
      content: `⚠️ القناة ${channel} مقفلة بالفعل!`, 
      ephemeral: true 
    });
  }

  // 1) منع الأعضاء العاديين من الإرسال
  await channel.permissionOverwrites.edit(everyoneRole, {
    SendMessages: false,
  });

  // 2) منح جميع الرتب الإدارية حق الإرسال صراحةً حتى لا تتأثر بالقفل
  await grantAdminAccess(channel, interaction.guild, {
    ViewChannel:   true,
    SendMessages:  true,
  });

  const embed = new EmbedBuilder()
    .setColor(Colors.RED)
    .setTitle('🔒  تم إغلاق القناة')
    .setDescription(`> ${channel} مغلقة الآن — الأعضاء لا يستطيعون الإرسال.\n> الرتب الإدارية تستطيع الإرسال بشكل طبيعي.`)
    .addFields(
      { name: '📋  السبب',  value: reason,                inline: true },
      { name: '🛡️  بواسطة', value: `${interaction.user}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  إدارة القنوات' });

  await interaction.reply({ embeds: [embed] });

  // إشعار القناة المقفلة (إذا كانت غير القناة الحالية)
  if (channel.id !== interaction.channel.id) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.RED)
          .setTitle('🔒  هذه القناة مغلقة')
          .setDescription(`> تم إغلاق هذه القناة بواسطة ${interaction.user}.\n> **السبب:** ${reason}`)
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  إدارة القنوات' }),
      ],
    }).catch(() => {});
  }

  // تسجيل العملية في السجلات (Logs)
  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.RED)
          .setTitle('🔒  إغلاق قناة')
          .addFields(
            { name: '📢  القناة',  value: `${channel}`,          inline: true },
            { name: '🛡️  المشرف', value: `${interaction.user}`,  inline: true },
            { name: '📋  السبب',  value: reason,                  inline: false },
          )
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' }),
      ],
    }).catch(() => {});
  }
}
