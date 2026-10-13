import { Events, AuditLogEvent } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, notice, field, userTag, C } from '../utils/embeds.js';
import { isEnabled } from '../utils/features.js';
import { nukeSettings, applyMemberAction, isExempt, PUNISH_LABEL } from '../utils/protection.js';

export const name = Events.RoleDelete;
export const once = false;

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
  // Dashboard-controlled: `anti_nuke`, `nuke_role_limit` inside `nuke_window`,
  // and `nuke_action`.
  if (!isEnabled('protection')) return;
  if (!executor || executor.bot || executor.id === guild.ownerId) return;

  const settings = nukeSettings(guild.id);
  if (!settings.enabled) return;

  const executorMember = await guild.members.fetch(executor.id).catch(() => null);
  if (isExempt(guild.id, executorMember, null)) return;

  const now    = Date.now();
  const action = 'role_delete';
  const data   = await getNukeData(guild.id, executor.id, action);

  let count     = 1;
  let lastReset = now;
  if (data && now - data.lastReset < settings.windowMs) {
    count     = data.count + 1;
    lastReset = data.lastReset;
  }
  await upsertNukeData(guild.id, executor.id, action, count, lastReset);

  if (count < settings.roleLimit) return;

  await upsertNukeData(guild.id, executor.id, action, 0, now);

  const done = await applyMemberAction(
    executorMember, settings.action, 'Anti-nuke: mass role deletion', 3_600_000,
  );

  const alertCh = modLogCh ?? logCh;
  if (alertCh) {
    await alertCh.send({
      embeds: [notice({
        title: '🚨 Anti-nuke — mass role deletion',
        description: `<@${executor.id}> (\`${executor.id}\`) deleted **${count}** roles in under ${Math.round(settings.windowMs / 1000)} seconds.\n`
          + `Action taken: **${PUNISH_LABEL[done] ?? done}**.`,
        color: C.error,
        fields: [
          field('Executor', `<@${executor.id}> (${userTag(executor)})`),
          field('User ID', `\`${executor.id}\``),
          field('Last role deleted', `\`${role.name}\``),
          field('Action taken', PUNISH_LABEL[done] ?? done),
        ],
        footer: 'Kratos System • Anti-nuke',
        timestamp: true,
      })],
    }).catch(() => {});
  }
}