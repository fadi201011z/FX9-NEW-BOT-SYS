import { Events, AuditLogEvent } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { notice, field, userTag, C } from '../utils/embeds.js';

export const name = Events.GuildBanAdd;
export const once = false;

const NUKE_THRESHOLD = 5;
const NUKE_WINDOW_MS = 10_000;

export async function execute(ban) {
  const { guild } = ban;

  let executor = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.MemberBanAdd);
    if (entry && Date.now() - entry.createdTimestamp < 5000) executor = entry.executor;
  } catch { /* audit log unavailable */ }

  if (!executor || executor.bot || executor.id === guild.ownerId) return;

  const now    = Date.now();
  const action = 'mass_ban';
  const data   = await getNukeData(guild.id, executor.id, action);

  let count     = 1;
  let lastReset = now;
  if (data && now - data.lastReset < NUKE_WINDOW_MS) {
    count     = data.count + 1;
    lastReset = data.lastReset;
  }
  await upsertNukeData(guild.id, executor.id, action, count, lastReset);

  if (count < NUKE_THRESHOLD) return;

  // Threshold reached — reset the counter so one raid produces one alert.
  await upsertNukeData(guild.id, executor.id, action, 0, now);

  let stripped = false;
  try {
    const member = await guild.members.fetch(executor.id);
    // Administrators are left alone: stripping every role from an admin would
    // lock the server out of its own moderation.
    if (member && !member.permissions.has('Administrator')) {
      await member.roles.set([], 'Anti-nuke: mass ban');
      stripped = true;
    }
  } catch { /* cannot modify */ }

  const alertCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'))
    ?? await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  if (alertCh) {
    await alertCh.send({
      embeds: [notice({
        title: '🚨 Anti-nuke — mass ban detected',
        description: `<@${executor.id}> issued **${count}** bans in under 10 seconds.\n`
          + (stripped
            ? 'All of their roles have been removed automatically.'
            : 'Their roles were **not** removed (Administrator or missing permissions).'),
        color: C.error,
        fields: [
          field('Executor', `<@${executor.id}> (${userTag(executor)})`),
          field('User ID', `\`${executor.id}\``),
          field('Last user banned', `${userTag(ban.user)} \`${ban.user.id}\``),
        ],
        footer: 'Kratos System • Anti-nuke',
        timestamp: true,
      })],
    }).catch(() => {});
  }
}