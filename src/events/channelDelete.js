import { Events, EmbedBuilder, AuditLogEvent, ChannelType } from 'discord.js';
import { getNukeData, upsertNukeData, getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors, alertEmbed } from '../utils/embeds.js';

export const name = Events.ChannelDelete;
export const once = false;

const NUKE_THRESHOLD = 3;
const NUKE_WINDOW_MS = 10_000;

const CHANNEL_TYPE_AR = {
  [ChannelType.GuildText]:        '💬 نصي',
  [ChannelType.GuildVoice]:       '🔊 صوتي',
  [ChannelType.GuildCategory]:    '📁 تصنيف',
  [ChannelType.GuildAnnouncement]:'📢 إعلانات',
};

export async function execute(channel) {
  const { guild } = channel;
  if (!guild) return;

  const modLogCh = await getLogChannel(guild, getConfig(guild.id, 'modlog_channel'));
  const logCh    = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  let executor = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
    const entry = logs.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 5000) {
      executor = entry.executor;
    }
  } catch { return; }

  // ─── سجل الحذف في قناة الإشراف ────────────────────────────────────────
  const targetCh = modLogCh ?? logCh;
  if (targetCh && executor) {
    const typeLabel = CHANNEL_TYPE_AR[channel.type] ?? 'غير معروف';
    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('🗑️  حذف قناة')
      .addFields(
        { name: '📋  اسم القناة', value: `\`${channel.name}\``,                       inline: true },
        { name: '🗂️  النوع',      value: typeLabel,                                    inline: true },
        { name: '🆔  معرّف القناة', value: `\`${channel.id}\``,                       inline: true },
        { name: '👤  المنفّذ',     value: `<@${executor.id}> (${executor.tag})`,       inline: false },
      )
      .setTimestamp()
      .setFooter({ text: '⚔️ FX9-SYS  •  سجلات الإشراف' });
    await targetCh.send({ embeds: [embed] }).catch(() => {});
  }

  // ─── Anti-Nuke ────────────────────────────────────────────────────────────
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

  if (count >= NUKE_THRESHOLD) {
    await upsertNukeData(guild.id, executor.id, action, 0, now);

    // سحب الأدوار من المنفّذ
    try {
      const member = await guild.members.fetch(executor.id);
      if (member && !member.permissions.has('Administrator')) {
        await member.roles.set([], 'Anti-Nuke: حذف جماعي للقنوات');
      }
    } catch { /* لا يمكن التعديل */ }

    const alertCh = modLogCh ?? logCh;
    if (alertCh) {
      await alertCh.send({
        embeds: [
          alertEmbed('تحذير Anti-Nuke — حذف جماعي للقنوات!')
            .setDescription(
              `> ⚠️ **${executor.tag}** قام بحذف **${count}** قنوات في أقل من 10 ثوانٍ!\n` +
              `> تم **سحب جميع أدواره** تلقائياً. راجع الأمر وتصرف فوراً.`
            )
            .addFields(
              { name: '👤  المنفّذ',      value: `<@${executor.id}> (${executor.tag})`, inline: true },
              { name: '🆔  المعرّف',      value: `\`${executor.id}\``,                 inline: true },
              { name: '🗑️  آخر قناة محذوفة', value: `\`${channel.name}\``,           inline: true },
            )
        ],
      }).catch(() => {});
    }
  }
}
