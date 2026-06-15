import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import {
  getSubscriptions, addSubscription, removeSubscription,
} from '../data/notificationDB.js';
import { getGuildConfig } from '../data/ticketDB.js';

async function resolveChannelId(platform, url) {
  if (platform === 'youtube') {
    const { resolveYouTubeChannelId } = await import('../handlers/notificationMonitor.js');
    return resolveYouTubeChannelId(url);
  }
  if (platform === 'kick') {
    const m = url.match(/kick\.com\/([\w-]+)/i);
    return m ? m[1] : url.trim().replace(/^@/, '');
  }
  if (platform === 'twitter') {
    const m = url.match(/(?:twitter\.com|x\.com)\/(\w+)/i);
    return m ? m[1] : url.trim().replace(/^@/, '');
  }
  return url;
}

export const data = new SlashCommandBuilder()
  .setName('notify')
  .setDescription('🔔 إدارة إشتراكات الإشعارات (يوتيوب / كيك / تويتر)')
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('إضافة إشتراك إشعارات جديد')
      .addStringOption(opt =>
        opt.setName('platform')
          .setDescription('المنصة')
          .setRequired(true)
          .addChoices(
            { name: '📹 YouTube', value: 'youtube' },
            { name: '🔴 Kick', value: 'kick' },
            { name: '🐦 Twitter/X', value: 'twitter' },
          ))
      .addStringOption(opt =>
        opt.setName('url')
          .setDescription('رابط القناة')
          .setRequired(true))
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('القناة اللي تنزل فيها الإشعارات')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('message')
          .setDescription('رسالة إضافية (اختياري) تظهر مع الإشعار')
          .setRequired(false)))
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('حذف إشتراك')
      .addStringOption(opt =>
        opt.setName('id')
          .setDescription('معرف الإشتراك')
          .setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('عرض جميع الإشتراكات في هذا السيرفر'));

export async function execute(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ هذا الأمر يعمل فقط داخل السيرفر.', flags: 64 });
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isAdmin =
    member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
    config.supportRoleIds?.some(id => member.roles.cache.has(id));

  if (!isAdmin) {
    await interaction.reply({ content: '❌ يحتاج صلاحية ManageChannels أو رتبة دعم.', flags: 64 });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    await interaction.deferReply({ ephemeral: true });

    const platform = interaction.options.getString('platform');
    const url = interaction.options.getString('url').trim();
    const discordCh = interaction.options.getChannel('channel');
    const customMessage = interaction.options.getString('message') || '';

    const resolvedId = await resolveChannelId(platform, url);
    if (!resolvedId) {
      await interaction.editReply({ content: `❌ ما قدرت استخرج معرف القناة من الرابط.\nتأكد من الرابط وحاول مره ثانية.` });
      return;
    }

    const existing = getSubscriptions(interaction.guildId);
    const dup = existing.find(s => s.platform === platform && s.channelId === resolvedId);
    if (dup) {
      await interaction.editReply({ content: `⚠️ القناة مضافه مسبقاً! (ID: \`${dup._id}\`)` });
      return;
    }

    try {
      const doc = await addSubscription({
        guildId: interaction.guildId,
        platform,
        channelUrl: url,
        channelId: resolvedId,
        discordChannelId: discordCh.id,
        customMessage,
      });

      const platLabel = platform === 'youtube' ? '📹 YouTube' : platform === 'kick' ? '🔴 Kick' : '🐦 Twitter';

      await interaction.editReply({
        content: [
          `✅ **تمت الإضافة!**`,
          `┃ المنصة: **${platLabel}**`,
          `┃ رابط القناة: ${url}`,
          `┃ قناة الإشعارات: <#${discordCh.id}>`,
          `┃ المعرف: \`${doc._id}\``,
          customMessage ? `┃ رسالة: ${customMessage}` : '',
        ].filter(Boolean).join('\n'),
      });
    } catch (err) {
      console.error('[Notify] Add error:', err);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء الإضافة.' });
    }
    return;
  }

  if (sub === 'remove') {
    await interaction.deferReply({ ephemeral: true });

    const id = interaction.options.getString('id').trim();
    const subItem = getSubscriptions(interaction.guildId).find(s => s._id.toString() === id);

    if (!subItem) {
      await interaction.editReply({ content: `❌ ما فيه إشتراك بهذا المعرف \`${id}\`` });
      return;
    }

    await removeSubscription(id);
    await interaction.editReply({ content: `✅ تم حذف الإشتراك \`${id}\` (${subItem.platform}).` });
    return;
  }

  if (sub === 'list') {
    await interaction.deferReply({ ephemeral: true });

    const subs = getSubscriptions(interaction.guildId);
    if (subs.length === 0) {
      await interaction.editReply({ content: '📭 لا يوجد أي إشتراكات في هذا السيرفر.' });
      return;
    }

    const lines = subs.map((s, i) => {
      const plat = s.platform === 'youtube' ? '📹' : s.platform === 'kick' ? '🔴' : '🐦';
      return `\`${i + 1}.\` ${plat} **${s.channelName || s.channelId}** — <#${s.discordChannelId}> — \`${s._id}\``;
    });

    await interaction.editReply({
      content: `**🔔 الإشتراكات (${subs.length}):**\n${lines.join('\n')}`,
    });
    return;
  }
}
