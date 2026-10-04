import { Events, AuditLogEvent } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { logEntry, notice, C } from '../utils/embeds.js';
import { getGuildInvite } from '../utils/invite.js';

export const name = Events.GuildBanRemove;
export const once = false;

export async function execute(ban, client) {
  const { guild, user } = ban;
  if (!guild || user.bot) return;

  // The bot's own /unban path already logs this — don't double-report.
  const key = `${guild.id}:${user.id}`;
  if (client.pendingAutoUnbans?.has(key)) return;

  let executor = null;
  try {
    const entry = await getAuditEntry(guild, AuditLogEvent.MemberBanRemove);
    if (entry && entry.target?.id === user.id && Date.now() - entry.createdTimestamp < 5000) {
      executor = `<@${entry.executor.id}> (${userTag(entry.executor)})`;
    }
  } catch { /* audit log unavailable */ }

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'member_unban',
        target: `${user} \`${user.id}\``,
        actor: executor,
        footer: 'Kratos System • Modlog',
      })],
    }).catch(() => {});
  }

  // ─── Tell the member ─────────────────────────────────────────────────────
  const inviteLink = await getGuildInvite(guild);
  try {
    await user.send({
      embeds: [notice({
        title: `✅ You have been unbanned from ${guild.name}`,
        description: inviteLink
          ? 'A staff member lifted your ban manually. You can rejoin here:\n'
            + inviteLink
          : 'A staff member lifted your ban manually. You can rejoin now.',
        color: C.ok,
        footer: 'Kratos System • Protection',
        timestamp: true,
      })],
    }).catch(() => {});
  } catch { /* DMs are closed */ }
}