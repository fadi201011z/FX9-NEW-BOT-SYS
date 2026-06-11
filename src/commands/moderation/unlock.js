import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { Colors } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES, clearAdminOverwrites } from '../../config/roles.js';

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

  // 🛡️ التحقق الذكي: هل القناة مفتوحة بالفعل؟
  const everyoneRole = interaction.guild.roles.everyone;
  const currentPermissions = channel.permissionOverwrites.cache.get(everyoneRole.id);

  // إذا لم يكن هناك منع (Deny) لصلاحية SendMessages، فهي مفتوحة
  if (!currentPermissions || !currentPermissions.deny.has(PermissionFlagsBits.SendMessages)) {
    return interaction.reply({ 
      content: `⚠️ القناة ${channel} مفتوحة بالفعل ولا تحتاج لإعادة فتح.`, 
      ephemeral: true 
    });
  }

  // 1) إعادة @everyone لوضعه الافتراضي (null = وراثة من التصنيف/السيرفر)
  await channel.permissionOverwrites.edit(everyoneRole, {
    SendMessages: null,
  });

  // 2) مسح الـ overrides الصريحة التي أضافها /lock للرتب الإدارية
  await clearAdminOverwrites(channel, interaction.guild);

  const embed = new EmbedBuilder()
    .setColor(Colors.WHITE)
    .setTitle('🔓  تم فتح القناة')
    .addFields(
      { name: '📢  القناة',  value: `${channel}`,          inline: true },
      { name: '🛡️  بواسطة', value: `${interaction.user}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  إدارة القنوات' });

  // الرد على الأمر
  await interaction.reply({ embeds: [embed] });

  // إرسال الإشعار داخل القناة المفتوحة (إذا لم تكن هي نفس قناة التفاعل)
  if (channel.id !== interaction.channel.id) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  // تسجيل العملية في السجلات (Logs)
  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(Colors.WHITE)
          .setTitle('🔓  فتح قناة')
          .addFields(
            { name: '📢  القناة',  value: `${channel}`,          inline: true },
            { name: '🛡️  المشرف', value: `${interaction.user}`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' }),
      ],
    }).catch(() => {});
  }
}
