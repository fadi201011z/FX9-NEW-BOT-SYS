import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('عرض جميع الأوامر المتاحة مع شرحها');

export async function execute(interaction) {
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('📋 اختر قسم الأوامر...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('⚙️ الإعدادات')
          .setDescription('أوامر إعداد جميع الأنظمة')
          .setValue('help_setup'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🔨 الإشراف')
          .setDescription('الحظر، الطرد، التحذيرات، مسح، وغيرها')
          .setValue('help_mod'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🎫 التكتات')
          .setDescription('نظام تكتات الدعم الفني')
          .setValue('help_ticket'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🎵 الصوت والموسيقى')
          .setDescription('القنوات المؤقتة، تشغيل الموسيقى')
          .setValue('help_voice'),
        new StringSelectMenuOptionBuilder()
          .setLabel('📊 المعلومات')
          .setDescription('معلومات السيرفر، البوت، الأعضاء')
          .setValue('help_info'),
        new StringSelectMenuOptionBuilder()
          .setLabel('👥 الأعضاء')
          .setDescription('البروفايل، الصورة الشخصية، الترتيب')
          .setValue('help_members'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🛡️ الحماية')
          .setDescription('أنظمة الحماية التلقائية')
          .setValue('help_protection'),
      )
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚔️ FX9 — دليل الأوامر الكامل')
    .setDescription(
      '> البوت الموحّد يجمع أنظمة الإدارة، التكتات، والصوت معاً\n' +
      '> اختر القسم من القائمة بالأسفل لاستعراض الأوامر 👇\n\n' +
      '**عدد الأوامر الكلي:** 52 أمر\n' +
      '**عدد الأقسام:** 6 أقسام رئيسية'
    )
    .setThumbnail(interaction.client.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '📋 الأقسام المتاحة',
        value: [
          '`⚙️ الإعدادات`   — الإعدادات الموحّدة /setup',
          '`🔨 الإشراف`     — الحظر، الطرد، التحذيرات، مسح، إدارة القنوات',
          '`🎫 التكتات`     — إرسال التكتات، التقييم، بنل التحكم',
          '`🎵 الصوت`       — القنوات المؤقتة، تشغيل الموسيقى',
          '`📊 المعلومات`   — معلومات السيرفر، البوت، الأعضاء',
          '`👥 الأعضاء`     — بروفايل، آفاتار، ترتيب، قوانين',
          '`🛡️ الحماية`    — أنظمة مكافحة السبام، النيوك، الرايد',
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'FX9 Merged Bot • اختر القسم من القائمة أدناه' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], components: [menu], flags: EPHEMERAL });
}
