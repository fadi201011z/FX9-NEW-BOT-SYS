import { Events, AuditLogEvent, ChannelType } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, notice, field, userTag, C } from '../utils/embeds.js';
import { isEnabled } from '../utils/features.js';
import { nukeSettings, applyMemberAction, isExempt, PUNISH_LABEL } from '../utils/protection.js';

export const name = Events.ChannelDelete;
export const once = false;

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
  // Dashboard-controlled: the `anti_nuke` gate, `nuke_channel_limit` deletions
  // inside `nuke_window` ms, and `nuke_action` (strip / kick / ban / timeout).
  if (!isEnabled('protection')) return;
  if (!executor || executor.bot || executor.id === guild.ownerId) return;

  const settings = nukeSettings(guild.id);
  if (!settings.enabled) return;

  const executorMember = await guild.members.fetch(executor.id).catch(() => null);
  if (isExempt(guild.id, executorMember, null)) return;

  const now    = Date.now();
  const action = 'channel_delete';
  const data   = await getNukeData(guild.id, executor.id, action);

  let count     = 1;
  let lastReset = now;
  if (data && now - data.lastReset < settings.windowMs) {
    count     = data.count + 1;
    lastReset = data.lastReset;
  }
  await upsertNukeData(guild.id, executor.id, action, count, lastReset);

  if (count < settings.channelLimit) return;

  await upsertNukeData(guild.id, executor.id, action, 0, now);

  const done = await applyMemberAction(
    executorMember, settings.action, 'Anti-nuke: mass channel deletion', 3_600_000,
  );

  const alertCh = modLogCh ?? logCh;
  if (alertCh) {
    await alertCh.send({
      embeds: [notice({
        title: '🚨 Anti-nuke — mass channel deletion',
        description: `<@${executor.id}> (\`${executor.id}\`) deleted **${count}** channels in under ${Math.round(settings.windowMs / 1000)} seconds.\n`
          + `Action taken: **${PUNISH_LABEL[done] ?? done}**.`,
        color: C.error,
        fields: [
          field('Executor', `<@${executor.id}> (${userTag(executor)})`),
          field('User ID', `\`${executor.id}\``),
          field('Last channel deleted', `\`${channel.name}\``),
          field('Action taken', PUNISH_LABEL[done] ?? done),
        ],
        footer: 'Kratos System • Anti-nuke',
        timestamp: true,
      })],
    }).catch(() => {});
  }
}