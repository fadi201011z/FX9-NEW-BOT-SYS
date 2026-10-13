import { Events, AuditLogEvent } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { notice, field, userTag, C } from '../utils/embeds.js';
import { isEnabled } from '../utils/features.js';
import { nukeSettings, applyMemberAction, isExempt, PUNISH_LABEL } from '../utils/protection.js';

export const name = Events.GuildBanAdd;
export const once = false;

export async function execute(ban) {
  const { guild } = ban;

  let executor = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.MemberBanAdd);
    if (entry && Date.now() - entry.createdTimestamp < 5000) executor = entry.executor;
  } catch { /* audit log unavailable */ }

  // Dashboard-controlled mass-ban detection.
  if (!isEnabled('protection')) return;
  if (!executor || executor.bot || executor.id === guild.ownerId) return;

  const settings = nukeSettings(guild.id);
  if (!settings.enabled) return;

  const executorMember = await guild.members.fetch(executor.id).catch(() => null);
  if (isExempt(guild.id, executorMember, null)) return;

  const now    = Date.now();
  const action = 'mass_ban';
  const data   = await getNukeData(guild.id, executor.id, action);

  let count     = 1;
  let lastReset = now;
  if (data && now - data.lastReset < settings.windowMs) {
    count     = data.count + 1;
    lastReset = data.lastReset;
  }
  await upsertNukeData(guild.id, executor.id, action, count, lastReset);

  if (count < settings.banLimit) return;

  // Threshold reached — reset the counter so one raid produces one alert.
  await upsertNukeData(guild.id, executor.id, action, 0, now);

  const done = await applyMemberAction(
    executorMember, settings.action, 'Anti-nuke: mass ban', 3_600_000,
  );

  const alertCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'))
    ?? await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  if (alertCh) {
    await alertCh.send({
      embeds: [notice({
        title: '🚨 Anti-nuke — mass ban',
        description: `<@${executor.id}> (\`${executor.id}\`) banned **${count}** members in under ${Math.round(settings.windowMs / 1000)} seconds.\n`
          + `Action taken: **${PUNISH_LABEL[done] ?? done}**.`,
        color: C.error,
        fields: [
          field('Executor', `<@${executor.id}> (${userTag(executor)})`),
          field('User ID', `\`${executor.id}\``),
          field('Last member banned', `${ban.user} (${userTag(ban.user)})`),
          field('Action taken', PUNISH_LABEL[done] ?? done),
        ],
        footer: 'Kratos System • Anti-nuke',
        timestamp: true,
      })],
    }).catch(() => {});
  }
}
