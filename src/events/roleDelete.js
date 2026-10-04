import { Events, AuditLogEvent } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, notice, field, userTag, C } from '../utils/embeds.js';

export const name = Events.RoleDelete;
export const once = false;

const NUKE_THRESHOLD = 3;
const NUKE_WINDOW_MS = 10_000;

export async function execute(role) {
  const guild = role.guild;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  const logCh    = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  let executor = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.RoleDelete);
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      executor = entry.executor;
    }
  } catch { /* audit log unavailable */ }

  // ─── Deletion log ────────────────────────────────────────────────────────
  const targetCh = modLogCh ?? logCh;
  if (targetCh && executor) {
    await targetCh.send({
      embeds: [logEntry({
        kind: 'role_delete',
        target: `\`${role.name}\``,
        actor: `<@${executor.id}> (${userTag(executor)})`,
        fields: [
          field('Role ID', `\`${role.id}\``),
          field('Colour', `\`#${role.color.toString(16).padStart(6, '0')}\``),
        ],
      })],
    }).catch(() => {});
  }

  // ─── Anti-nuke ───────────────────────────────────────────────────────────
  // Three role deletions by one account inside ten seconds is a compromise
  // pattern. Strip their roles and shout about it.
  if (!executor || executor.bot || executor.id === guild.ownerId) return;

  const now    = Date.now();
  const action = 'role_delete';
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

  let stripped = false;
  try {
    const member = await guild.members.fetch(executor.id);
    if (member && !member.permissions.has('Administrator')) {
      await member.roles.set([], 'Anti-nuke: mass role deletion');
      stripped = true;
    }
  } catch { /* cannot modify */ }

  const alertCh = modLogCh ?? logCh;
  if (alertCh) {
    await alertCh.send({
      embeds: [notice({
        title: '🚨 Anti-nuke — mass role deletion',
        description: `<@${executor.id}> (\`${executor.id}\`) deleted **${count}** roles in under 10 seconds.\n`
          + (stripped ? 'All of their roles have been removed.' : 'Their roles were **not** removed (Administrator or missing permissions).'),
        color: C.error,
        fields: [
          field('Executor', `<@${executor.id}> (${userTag(executor)})`),
          field('User ID', `\`${executor.id}\``),
          field('Last role deleted', `\`${role.name}\``),
        ],
        footer: 'Kratos System • Anti-nuke',
        timestamp: true,
      })],
    }).catch(() => {});
  }
}