import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { getAuditEntry } from '../utils/audit.js';
import { Colors, alertEmbed, userTag } from '../utils/embeds.js';

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
  } catch {}

  // ─── سجل الحذف في قناة الإشراف ────────────────────────────────────────
  const targetCh = modLogCh ?? logCh;
  if (targetCh && executor) {
    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('🗑️  حذف رتبة')
      .addFields(
        { name: '🏷️  الرتبة',    value: `\`${role.name}\``,                  inline: true },
        { name: '🆔  المعرّف',    value: `\`${role.id}\``,                    inline: true },
        { name: '🎨  اللون',      value: `\`#${role.color.toString(16).padStart(6, '0')}\``, inline: true },
        { name: '👤  المنفّذ',    value: `<@${executor.id}> (${userTag(executor)})`, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });
    await targetCh.send({ embeds: [embed] }).catch(() => {});
  }

  // ─── Anti-Nuke ────────────────────────────────────────────────────────────
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

  if (count >= NUKE_THRESHOLD) {
    await upsertNukeData(guild.id, executor.id, action, 0, now);

    try {
      const member = await guild.members.fetch(executor.id);
      if (member && !member.permissions.has('Administrator')) {
        await member.roles.set([], 'Anti-Nuke: حذف جماعي للرتب');
      }
    } catch { /* لا يمكن التعديل */ }

    const alertCh = modLogCh ?? logCh;
    if (alertCh) {
      await alertCh.send({
        embeds: [
          alertEmbed('تحذير Anti-Nuke — حذف جماعي للرتب!')
            .setDescription(
              `> ⚠️ **${userTag(executor)}** قام بحذف **${count}** رتب في أقل من 10 ثوانٍ!\n` +
              `> تم **سحب جميع أدواره** تلقائياً. راجع الأمر وتصرف فوراً.`
            )
            .addFields(
              { name: '👤  المنفّذ',      value: `<@${executor.id}> (${userTag(executor)})`, inline: true },
              { name: '🆔  المعرّف',      value: `\`${executor.id}\``,                    inline: true },
              { name: '🗑️  آخر رتبة محذوفة', value: `\`${role.name}\``,                  inline: true },
            )
        ],
      }).catch(() => {});
    }
  }
}