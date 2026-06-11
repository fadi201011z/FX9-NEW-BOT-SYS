import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Colors, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('عرض إعدادات البوت الحالية لهذا السيرفر')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const g = interaction.guildId;

  const welcomeId = getConfig(g, 'welcome_channel');
  const logId     = getConfig(g, 'log_channel');
  const modLogId  = getConfig(g, 'modlog_channel');
  const botLogId  = getConfig(g, 'botlog_channel');
  const totalId   = getConfig(g, 'stats_total');
  const onlineId  = getConfig(g, 'stats_online');
  const botsId    = getConfig(g, 'stats_bots');

  const ch    = (id, cmd) => id ? `<#${id}>` : `❌ غير محدد — \`${cmd}\``;
  const vc    = (id)      => id ? `<#${id}>` : '❌ غير محدد';
  const dot   = (id)      => id ? '🟢' : '🔴';

  const embed = new EmbedBuilder()
    .setColor(Colors.DARK)
    .setTitle(`⚙️  لوحة الإعدادات — ${interaction.guild.name}`)
    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
    .addFields(
      {
        name: '📢  القنوات النصية',
        value: [
          `${dot(welcomeId)} **ترحيب:**       ${ch(welcomeId,  '/setup-welcome')}`,
          `${dot(logId)}    **سجلات عامة:**  ${ch(logId,      '/setup-logs')}`,
          `${dot(modLogId)} **سجلات إشراف:** ${ch(modLogId,   '/setup-modlogs')}`,
          `${dot(botLogId)} **سجل البوت:**   ${ch(botLogId,   '/setup-botlogs')}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📊  قنوات الإحصائيات (تتحدث كل دقيقة)',
        value: [
          `${dot(totalId)}  **الأعضاء:** ${vc(totalId)}`,
          `${dot(onlineId)} **متصلون:**  ${vc(onlineId)}`,
          `${dot(botsId)}   **بوتات:**   ${vc(botsId)}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🛡️  الحماية التلقائية (دائماً مفعّلة)',
        value: [
          '🟢 **Anti-Spam** — 5 رسائل/5ث → إيقاف 60ث',
          '🟢 **Anti-Link** — حذف الروابط غير المسموحة',
          '🟢 **Anti-Nuke** — منع حذف القنوات الجماعي',
          '🟢 **Anti-Ban**  — منع الحظر الجماعي',
          '🟢 **Raid Detection** — تنبيه عند 10+ انضمامات/10ث',
        ].join('\n'),
        inline: false,
      },
      {
        name: '📂  توزيع السجلات',
        value: [
          '`/setup-logs`    ← انضمام/مغادرة، رسائل، صوت، لقب',
          '`/setup-modlogs` ← ban/kick/timeout/warn/lock/role/قنوات',
          '`/setup-botlogs` ← تشغيل/إيقاف/أخطاء البوت',
        ].join('\n'),
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  لوحة الإعدادات' });

  await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
}
