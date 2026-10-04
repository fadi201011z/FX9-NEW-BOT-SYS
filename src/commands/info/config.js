import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { notice, field, C, EPHEMERAL } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Show every bot setting for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const UNSET = '❌ not set';

export async function execute(interaction) {
  const guildId = interaction.guildId;

  const welcome = getConfig(guildId, 'welcome_channel');
  const log     = getConfig(guildId, 'log_channel');
  const modLog  = getConfig(guildId, 'modlog_channel');
  const botLog  = getConfig(guildId, 'botlog_channel');
  const total   = getConfig(guildId, 'stats_total');
  const online  = getConfig(guildId, 'stats_online');
  const bots    = getConfig(guildId, 'stats_bots');
  const autoRole = getConfig(guildId, 'autorole_id');

  // A green/red marker makes a wall of settings scannable at a glance.
  const row = (label, id, fix) => `${id ? '🟢' : '🔴'} **${label}:** ${id ? `<#${id}>` : `${UNSET} — \`${fix}\``}`;

  await interaction.reply({
    embeds: [notice({
      title: `⚙️ Settings — ${interaction.guild.name}`,
      color: C.neutral,
      thumbnail: interaction.guild.iconURL({ dynamic: true }),
      fields: [
        field('📢 Log channels', [
          row('Welcome', welcome, '/setup-welcome'),
          row('Server log', log, '/setup-logs'),
          row('Modlog', modLog, '/setup-modlogs'),
          row('Bot log', botLog, '/setup-botlogs'),
        ].join('\n'), false),
        field('📊 Statistics channels — refresh every minute', [
          `${total ? '🟢' : '🔴'} **Members:** ${total ? `<#${total}>` : UNSET}`,
          `${online ? '🟢' : '🔴'} **Online:** ${online ? `<#${online}>` : UNSET}`,
          `${bots ? '🟢' : '🔴'} **Bots:** ${bots ? `<#${bots}>` : UNSET}`,
        ].join('\n'), false),
        field('🛡️ Auto-role', autoRole ? `🟢 <@&${autoRole}>` : `${UNSET} — set from the dashboard`, false),
        field('🔒 Protection — always on, no setup needed', [
          '🟢 **Anti-spam** — 5 messages in 5 seconds → 60-second mute.',
          '🟢 **Anti-link** — disallowed links are deleted.',
          '🟢 **Anti-mention** — 5+ mentions in one message → deleted.',
          '🟢 **Anti-nuke** — stops mass channel deletion and mass bans.',
          '🟢 **Raid detection** — alerts on 10+ joins in 10 seconds.',
        ].join('\n'), false),
        field('📂 What goes where', [
          '`/setup-logs` — joins and leaves, messages, voice, nicknames.',
          '`/setup-modlogs` — bans, kicks, timeouts, warnings, locks, role changes, channel changes.',
          '`/setup-botlogs` — startup, shutdown, errors, periodic report.',
          '`/configt` — ticket system settings, listed separately by `/configt show`.',
        ].join('\n'), false),
      ],
      footer: 'Kratos System • Settings',
      timestamp: true,
    })],
    flags: EPHEMERAL,
  });
}