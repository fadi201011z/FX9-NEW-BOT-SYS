import { Events, AuditLogEvent, EmbedBuilder, ChannelType } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, userTag } from '../utils/embeds.js';

export const name = Events.ChannelUpdate;
export const once = false;

const CHANNEL_TYPE_AR = {
  [ChannelType.GuildText]:        '💬 نصي',
  [ChannelType.GuildVoice]:       '🔊 صوتي',
  [ChannelType.GuildCategory]:    '📁 تصنيف',
  [ChannelType.GuildAnnouncement]:'📢 إعلانات',
  [ChannelType.GuildForum]:       '💭 منتدى',
  [ChannelType.GuildStageVoice]:  '🎙️ مسرح',
};

export async function execute(oldChannel, newChannel) {
  const guild = newChannel.guild;
  if (!guild) return;

  const nameChanged = oldChannel.name !== newChannel.name;
  const topicChanged = oldChannel.topic !== newChannel.topic;
  if (!nameChanged && !topicChanged) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let modifiedBy = 'غير معروف';
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.ChannelUpdate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      modifiedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch {}

  const typeLabel = CHANNEL_TYPE_AR[newChannel.type] ?? 'غير معروف';

  const embed = new EmbedBuilder()
    .setColor(Colors.EDIT)
    .setTitle('✏️  تعديل قناة')
    .addFields(
      { name: '📋  القناة',   value: `${newChannel}`,                       inline: true },
      { name: '🆔  المعرّف',  value: `\`${newChannel.id}\``,                inline: true },
      { name: '🗂️  النوع',   value: typeLabel,                             inline: true },
      ...(nameChanged ? [
        { name: '📝  الاسم قبل', value: oldChannel.name.slice(0, 1024) || '*[فارغ]*', inline: true },
        { name: '📝  الاسم بعد', value: newChannel.name.slice(0, 1024),               inline: true },
      ] : []),
      { name: '🛡️  بواسطة', value: modifiedBy, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });

  if (topicChanged) {
    embed.addFields(
      { name: '📌  الوصف قبل', value: (oldChannel.topic || '*[فارغ]*').slice(0, 1024), inline: false },
      { name: '📌  الوصف بعد', value: (newChannel.topic || '*[فارغ]*').slice(0, 1024), inline: false },
    );
  }

  await modLogCh.send({ embeds: [embed] }).catch(() => {});
}