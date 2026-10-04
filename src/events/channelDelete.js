import { Events, AuditLogEvent, ChannelType } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, notice, field, userTag, C } from '../utils/embeds.js';

export const name = Events.ChannelDelete;
export const once = false;

const NUKE_THRESHOLD = 3;
const NUKE_WINDOW_MS = 10_000;

const CHANNEL_TYPE_LABEL = {
  [ChannelType.GuildText]:         '💬 Text',
  [ChannelType.GuildVoice]:        '🔊 Voice',
  [ChannelType.GuildCategory]:     '📁 Category',
  [ChannelType.GuildAnnouncement]: '📢 Announcement',
};

export async function execute(channel) {
  const { guild } = channel;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  const logCh    = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  let executor = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.ChannelDelete);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      executor = entry.executor;
    }
  } catch { /* audit log unavailable */ }

  // ─── Deletion log ────────────────────────────────────────────────────────
  const targetCh = modLogCh ?? logCh;
  if (targetCh && executor) {
    await targetCh.send({
      embeds: [logEntry({
        kind: 'channel_delete',
        target: `\`${channel.name}\``,
        actor: `<@${executor.id}> (${userTag(executor)})`,
        fields: [
          field('Type', CHANNEL_TYPE_LABEL[channel.type] ?? 'Unknown'),
          field('Channel ID', `\`${channel.id}\``),
        ],
      })],
    }).catch(() => {});
  }

  // ─── Anti-nuke ───────────────────────────────────────────────────────────
  // Three channel deletions by one account inside ten seconds is a compromise
  // pattern, not admin activity. Strip their roles and shout about it.
  if (!executor || executor.bot || executor.id === guild.ownerId) return;

  const now    = Date.now();
  const action = 'channel_delete';
  const data   = await getNukeData(guild.id, executor.id, action);

  let count     = 1;
  let lastReset = now;
  if (data && now - data.lastReset < NUKE_WINDOW_MS) {
    count     = data.count + 1;
    lastReset = data.lastReset;
  }
  await upsertNukeData(guild.id, executor.id, action, count, lastReset);

  if (count < NUKE_THRESHOLD) return;

  await upsertNukeData(guild.id, executor.id, action, 0, now);

  // Strip their roles. Skipped for Administrators — removing every role from
  // an admin would lock the server out of its own moderation.
  let stripped = false;
  try {
    const member = await guild.members.fetch(executor.id);
    if (member && !member.permissions.has('Administrator')) {
      await member.roles.set([], 'Anti-nuke: mass channel deletion');
      stripped = true;
    }
  } catch { /* cannot modify */ }

  const alertCh = modLogCh ?? logCh;
  if (alertCh) {
    await alertCh.send({
      embeds: [notice({
        title: '🚨 Anti-nuke — mass channel deletion',
        description: `<@${executor.id}> (\`${executor.id}\`) deleted **${count}** channels in under 10 seconds.\n`
          + (stripped ? 'All of their roles have been removed.' : 'Their roles were **not** removed (Administrator or missing permissions).'),
        color: C.error,
        fields: [
          field('Executor', `<@${executor.id}> (${userTag(executor)})`),
          field('User ID', `\`${executor.id}\``),
          field('Last channel deleted', `\`${channel.name}\``),
        ],
        footer: 'Kratos System • Anti-nuke',
        timestamp: true,
      })],
    }).catch(() => {});
  }
}