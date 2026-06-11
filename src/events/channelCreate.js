import { Events, EmbedBuilder, AuditLogEvent, ChannelType } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';

export const name = Events.ChannelCreate;
export const once = false;

const CHANNEL_TYPE_AR = {
  [ChannelType.GuildText]:        '💬 نصي',
  [ChannelType.GuildVoice]:       '🔊 صوتي',
  [ChannelType.GuildCategory]:    '📁 تصنيف',
  [ChannelType.GuildAnnouncement]:'📢 إعلانات',
  [ChannelType.GuildForum]:       '💭 منتدى',
  [ChannelType.GuildStageVoice]:  '🎙️ مسرح',
};

export async function execute(channel) {
  const { guild } = channel;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let creator = 'غير معروف';
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      creator = `<@${entry.executor.id}> (${entry.executor.tag})`;
    }
  } catch { /* audit log غير متاح */ }

  const typeLabel = CHANNEL_TYPE_AR[channel.type] ?? 'غير معروف';
  const parent    = channel.parent ? `${channel.parent.name}` : 'لا يوجد';

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setTitle('📌  إنشاء قناة جديدة')
    .addFields(
      { name: '📋  اسم القناة', value: `${channel} (\`${channel.name}\`)`,   inline: true },
      { name: '🆔  المعرّف',    value: `\`${channel.id}\``,                   inline: true },
      { name: '🗂️  النوع',      value: typeLabel,                              inline: true },
      { name: '📁  التصنيف',    value: parent,                                 inline: true },
      { name: '👤  المنشئ',     value: creator,                                inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });

  await modLogCh.send({ embeds: [embed] }).catch(() => {});
}
