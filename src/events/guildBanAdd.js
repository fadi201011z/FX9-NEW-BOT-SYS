import { Events, AuditLogEvent } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { alertEmbed } from '../utils/embeds.js';

export const name = Events.GuildBanAdd;
export const once = false;

const NUKE_THRESHOLD = 5;
const NUKE_WINDOW_MS = 10_000;

export async function execute(ban) {
  const { guild } = ban;

  let executor = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000) executor = entry.executor;
  } catch { return; }

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

  if (count >= NUKE_THRESHOLD) {
    await upsertNukeData(guild.id, executor.id, action, 0, now);

    try {
      const member = await guild.members.fetch(executor.id);
      if (member) await member.roles.set([], 'Anti-Nuke: حظر جماعي');
    } catch { /* لا يمكن التعديل */ }

    const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
    const logCh    = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));
    const alertCh  = modLogCh ?? logCh;

    if (alertCh) {
      await alertCh.send({
        embeds: [
          alertEmbed('تحذير Anti-Nuke — حظر جماعي مُكتشَف!')
            .setDescription(
              `> ⚠️ **${executor.tag}** نفّذ **${count}** حظر في أقل من 10 ثوانٍ!\n` +
              `> تم **سحب جميع أدواره** تلقائياً. راجع الأمر وتصرف فوراً.`
            )
            .addFields(
              { name: '👤  المنفّذ',           value: `<@${executor.id}> (${executor.tag})`, inline: true },
              { name: '🆔  المعرّف',           value: `\`${executor.id}\``,                 inline: true },
              { name: '🚫  آخر محظور',         value: `${ban.user.tag} \`${ban.user.id}\``, inline: true },
            )
        ],
      }).catch(() => {});
    }
  }
}
