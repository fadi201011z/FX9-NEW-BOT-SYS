import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole } from '../../utils/permissions.js';
import { successEmbed, errorEmbed, EPHEMERAL } from '../../utils/embeds.js';
import { COMMAND_ROLES } from '../../config/roles.js';

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

  await interaction.deferReply({ flags: EPHEMERAL });

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
      embeds: [errorEmbed('لا توجد رسائل', 'لم يُعثر على رسائل مطابقة للفلتر (الرسائل الأقدم من 14 يوماً لا يمكن مسحها).')],
    });
  }

  const deleted = await interaction.channel.bulkDelete(messages, true);

  let desc = `تم مسح **${deleted.size}** رسالة بنجاح.`;
  if (filterUser) desc += `\n📌 **الفلتر:** رسائل ${filterUser}`;
  if (botsOnly)   desc += `\n📌 **الفلتر:** رسائل البوتات فقط`;

  await interaction.editReply({ embeds: [successEmbed('تم مسح الرسائل', desc)] });
}
