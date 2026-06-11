import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('⚙️ فتح قائمة الإعدادات المركزية لجميع الأنظمة');

export async function execute(interaction) {
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup_menu')
      .setPlaceholder('📋 اختر النظام الذي تريد إعداده...')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('🎫 نظام التكتات')
          .setDescription('إعداد تكتات الدعم، الرتب، القنوات المزدوجة')
          .setValue('setup_ticket'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🎙️ القنوات الصوتية المؤقتة')
          .setDescription('إعداد Join-to-Create ولوحة التحكم')
          .setValue('setup_voice'),
        new StringSelectMenuOptionBuilder()
          .setLabel('⚙️ الإعدادات العامة')
          .setDescription('الترحيب، السجلات، الإحصائيات، رتب الإشراف')
          .setValue('setup_general'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🤖 إعدادات البوت')
          .setDescription('سجل البوت، الحالة، والمعلومات')
          .setValue('setup_bot'),
      )
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️ مركز الإعدادات الموحّد — FX9')
    .setDescription(
      '> اختر النظام الذي تريد إعداده من القائمة أدناه:\n\n' +
      '🎫 **نظام التكتات** — تكتات الدعم الفني (الأقسام، الرتب، الريلاي)\n' +
      '🎙️ **القنوات الصوتية المؤقتة** — نظام Join-to-Create\n' +
      '⚙️ **الإعدادات العامة** — الترحيب، السجلات، الإحصائيات، الرتب\n' +
      '🤖 **إعدادات البوت** — سجل البوت، الحالة، المعلومات\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '💡 **اختر من القائمة بالأسفل** 👇'
    )
    .setFooter({ text: 'FX9 Merged Bot • مركز الإعدادات الموحّد' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], components: [menu], flags: EPHEMERAL });
}
