import { Events, AuditLogEvent, ChannelType } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';

export const name = Events.ChannelCreate;
export const once = false;

const CHANNEL_TYPE_LABEL = {
  [ChannelType.GuildText]:         '💬 Text',
  [ChannelType.GuildVoice]:        '🔊 Voice',
  [ChannelType.GuildCategory]:     '📁 Category',
  [ChannelType.GuildAnnouncement]: '📢 Announcement',
  [ChannelType.GuildForum]:        '💭 Forum',
  [ChannelType.GuildStageVoice]:   '🎙️ Stage',
};

export async function execute(channel) {
  const { guild } = channel;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let creator = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.ChannelCreate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      creator = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  await modLogCh.send({
    embeds: [logEntry({
      kind: 'channel_create',
      target: `${channel} (\`${channel.name}\`)`,
      actor: creator,
      fields: [
        field('Channel ID', `\`${channel.id}\``),
        field('Type', CHANNEL_TYPE_LABEL[channel.type] ?? 'Unknown'),
        field('Category', channel.parent ? channel.parent.name : 'None'),
      ],
    })],
  }).catch(() => {});
}