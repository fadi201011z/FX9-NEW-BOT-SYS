import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { COLOR, footer } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('مسح رسائل بشكل جماعي مع فلاتر اختيارية')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(opt =>
    opt.setName('amount').setDescription('عدد الرسائل للمسح (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
  )
  .addUserOption(opt => opt.setName('user').setDescription('مسح رسائل عضو معين فقط'))
  .addBooleanOption(opt => opt.setName('bots_only').setDescription('مسح رسائل البوتات فقط'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.clear)) return;

  await interaction.deferReply({ flags: 64 });

  const amount     = interaction.options.getInteger('amount');
  const filterUser = interaction.options.getUser('user');
  const botsOnly   = interaction.options.getBoolean('bots_only') ?? false;

  let messages = await interaction.channel.messages.fetch({ limit: 100 });

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  messages = messages.filter(m => m.createdTimestamp > twoWeeksAgo);

  if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);
  if (botsOnly)   messages = messages.filter(m => m.author.bot);

  messages = messages.first(amount);

  if (messages.length === 0) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.red)
          .setTitle('⚠️  فشل المسح')
          .setDescription([
            '```ansi',
            '\u001b[1;31m✖  لا توجد رسائل مطابقة للفلتر\u001b[0m',
            '```',
            `${DIV}`,
            '',
            '> الرسائل الأقدم من 14 يوماً لا يمكن مسحها',
          ].join('\n'))
          .setFooter(footer('FX9 • إدارة القنوات'))
          .setTimestamp(),
      ],
    });
  }

  const deleted = await interaction.channel.bulkDelete(messages, true);

  const filterLines = [];
  if (filterUser) filterLines.push(`**👤 العضو**  ─  ${filterUser}`);
  if (botsOnly)   filterLines.push(`**🤖 البوتات**  ─  تمت تصفية البوتات فقط`);
  const filterText = filterLines.length ? `\n${filterLines.join('\n')}\n` : '';

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.green)
        .setTitle('🧹  تم المسح')
        .setDescription([
          '```ansi',
          `\u001b[1;32m✓  تم مسح ${deleted.size} رسالة  │  ${interaction.channel.name}\u001b[0m`,
          '```',
          `${DIV}`,
          '',
          `**🛡️ بواسطة**  ─  ${interaction.user}`,
          `**📊 العدد**  ─  ${deleted.size}`,
          filterText,
          `${DIV}`,
        ].join('\n'))
        .setFooter(footer(`FX9 • ${interaction.channel.name}`))
        .setTimestamp(),
    ],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.green)
          .setTitle('🧹  سجل — مسح رسائل')
          .setDescription([
            '```ansi',
            `\u001b[1;32m🧹  مسح  │  ${interaction.channel.name}\u001b[0m`,
            '```',
            `${DIV}`,
            '',
            `**📢 القناة**  ─  ${interaction.channel}`,
            `**🛡️ المشرف**  ─  ${interaction.user}`,
            `**📊 العدد**  ─  ${deleted.size}`,
            filterText,
          ].join('\n'))
          .setFooter(footer('FX9 • سجلات الإشراف'))
          .setTimestamp(),
      ],
    }).catch(() => {});
  }
}
