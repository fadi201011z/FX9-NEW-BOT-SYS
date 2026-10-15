import { Events, AuditLogEvent, ChannelType } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, field, userTag } from '../utils/embeds.js';
import { isSelfMaintainedChannel } from '../utils/logFilter.js';
import { isSelfAction, channelRenameKey } from '../utils/recentAction.js';

export const name = Events.ChannelUpdate;
export const once = false;

const CHANNEL_TYPE_LABEL = {
  [ChannelType.GuildText]:         '💬 Text',
  [ChannelType.GuildVoice]:        '🔊 Voice',
  [ChannelType.GuildCategory]:     '📁 Category',
  [ChannelType.GuildAnnouncement]: '📢 Announcement',
  [ChannelType.GuildForum]:        '💭 Forum',
  [ChannelType.GuildStageVoice]:   '🎙️ Stage',
};

export async function execute(oldChannel, newChannel) {
  const guild = newChannel.guild;
  if (!guild) return;

  const nameChanged  = oldChannel.name !== newChannel.name;
  const topicChanged = oldChannel.topic !== newChannel.topic;
  if (!nameChanged && !topicChanged) return;

  // Channels the bot renames by itself (the live statistics counters) are not
  // moderation events. Without this gate they wrote one "channel updated" card
  // to the modlog every minute, for as long as the bot stayed up — which was
  // the loudest source of noise in the logs.
  if (isSelfMaintainedChannel(guild.id, newChannel.id)) return;
  if (isSelfAction(channelRenameKey(guild.id, newChannel.id))) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (!modLogCh) return;

  let modifiedBy = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.ChannelUpdate);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      // A rename performed by the bot itself (a ticket channel, a temp room) is
      // recorded by whichever feature owns it, so the generic channel-update
      // entry is dropped here instead of every caller having to stand down.
      if (entry.executor?.id === newChannel.client.user.id) return;
      modifiedBy = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  const fields = [
    field('Channel ID', `\`${newChannel.id}\``),
    field('Type', CHANNEL_TYPE_LABEL[newChannel.type] ?? 'Unknown'),
  ];

  if (nameChanged) {
    fields.push(field('Name before', oldChannel.name.slice(0, 1024) || '*empty*'));
    fields.push(field('Name after', newChannel.name.slice(0, 1024)));
  }

  if (topicChanged) {
    fields.push(field('Topic before', (oldChannel.topic || '*empty*').slice(0, 1024), false));
    fields.push(field('Topic after', (newChannel.topic || '*empty*').slice(0, 1024), false));
  }

  await modLogCh.send({
    embeds: [logEntry({
      kind: 'channel_update',
      target: newChannel.toString(),
      actor: modifiedBy,
      fields,
    })],
  }).catch(() => {});
}