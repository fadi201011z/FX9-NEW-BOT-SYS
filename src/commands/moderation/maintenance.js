import { SlashCommandBuilder } from 'discord.js';
import Maintenance from '../../models/Maintenance.js';
import { setMaintenancePresence, clearMaintenancePresence } from '../../utils/presence.js';
import { sendMaintenanceStart, sendMaintenanceEnd } from '../../utils/maintenanceEmbed.js';
import { fail, notice, modAction, field, C, EPHEMERAL, userTag } from '../../utils/embeds.js';
import { ROLES } from '../../config/roles.js';

const DEV_ID = process.env.BOT_DEVELOPER_ID || null;

/**
 * A caught failure must never reach the user as "Could not start maintenance: "
 * with nothing after the colon. `err.message` is empty for some thrown values
 * (a bare string, a null-prototype object, a rejected fetch), so fall back to a
 * generic phrase instead of printing a blank reason.
 */
const why = (err) => {
  const msg = (err && typeof err.message === 'string' ? err.message : String(err ?? '')).trim();
  return msg || 'the reason was not reported';
};

function canManage(interaction) {
  if (DEV_ID && interaction.user.id === DEV_ID) return true;
  return interaction.member.roles?.cache?.has(ROLES.DEVELOPER[0]) || false;
}

export const data = new SlashCommandBuilder()
  .setName('maintenance')
  .setDescription('🛠️ Manage maintenance mode')
  .addSubcommand(sub =>
    sub.setName('start')
      .setDescription('Turn maintenance mode on')
      .addIntegerOption(opt =>
        opt.setName('duration')
          .setDescription('Minutes to stay in maintenance (0 or omit = indefinite)')
          .setMinValue(0)
      )
  )
  .addSubcommand(sub =>
    sub.setName('stop')
      .setDescription('Turn maintenance mode off')
  )
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Show the current maintenance state')
  );

export async function execute(interaction) {
  if (!canManage(interaction)) {
    return interaction.reply(fail('Only bot developers can use this command.'));
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    await handleStart(interaction);
  } else if (sub === 'stop') {
    await handleStop(interaction);
  } else if (sub === 'status') {
    await handleStatus(interaction);
  }
}

async function handleStart(interaction) {
  // Public: turning maintenance on pauses every command in the server, so the
  // channel has to record who did it and for how long.
  await interaction.deferReply();

  try {
    const duration = interaction.options.getInteger('duration');

    let doc = await Maintenance.findOne();
    if (!doc) doc = new Maintenance();

    // This command drives the BOT half only; the dashboard's site switch is
    // independent and untouched here.
    doc.botEnabled = true;
    doc.botStartedAt = Date.now();
    doc.updatedAt = Date.now();
    doc.updatedBy = interaction.user.id;

    if (duration !== null && duration > 0) {
      doc.botEndTime = Date.now() + duration * 60 * 1000;
      doc.botDurationMinutes = duration;
    } else {
      doc.botEndTime = null;
      doc.botDurationMinutes = 0;
    }

    await doc.save();

    setMaintenancePresence(interaction.client, doc.botMessage);

    if (doc.channelId) {
      await sendMaintenanceStart(interaction.client, doc.channelId, doc.botMessage, doc.botEndTime);
    }

    await interaction.editReply({
      embeds: [modAction({
        kind: 'maintenance_start',
        description: doc.botDurationMinutes > 0
          ? `All commands and protection systems are paused for ${doc.botDurationMinutes} minute${doc.botDurationMinutes === 1 ? '' : 's'}.`
          : 'All commands and protection systems are paused until maintenance ends.',
        actor: userTag(interaction.user),
        fields: [
          field('Duration', doc.botDurationMinutes > 0
            ? `<t:${Math.floor(doc.botEndTime / 1000)}:R>`
            : 'Indefinite'),
          ...(doc.channelId ? [field('Announcement', `<#${doc.channelId}>`)] : []),
        ],
      })],
    });
  } catch (err) {
    console.error('[MaintenanceCmd] Failed to start maintenance:', why(err));
    await interaction.editReply(fail(`Could not start maintenance: ${why(err)}`));
  }
}

async function handleStop(interaction) {
  await interaction.deferReply();

  try {
    const doc = await Maintenance.findOne();
    if (!doc || !doc.botEnabled) {
      return interaction.editReply(fail('Maintenance was not on.'));
    }

    const oldChannelId = doc.channelId || '';
    const oldDuration  = doc.botDurationMinutes || 0;

    doc.botEnabled = false;
    doc.botEndTime = null;
    doc.botDurationMinutes = 0;
    doc.updatedAt = Date.now();
    doc.updatedBy = interaction.user.id;

    await doc.save();

    clearMaintenancePresence(interaction.client);

    if (oldChannelId) {
      await sendMaintenanceEnd(interaction.client, oldChannelId, oldDuration);
    }

    await interaction.editReply({
      embeds: [modAction({
        kind: 'maintenance_stop',
        description: 'All commands and protection systems are live again.',
        actor: userTag(interaction.user),
        fields: [
          field('Ran for', oldDuration > 0 ? `${oldDuration} minute${oldDuration === 1 ? '' : 's'}` : 'Unknown'),
          ...(oldChannelId ? [field('Announcement', `<#${oldChannelId}>`)] : []),
        ],
      })],
    });
  } catch (err) {
    console.error('[MaintenanceCmd] Failed to stop maintenance:', why(err));
    await interaction.editReply(fail(`Could not stop maintenance: ${why(err)}`));
  }
}

async function handleStatus(interaction) {
  try {
    const doc = await Maintenance.findOne().lean();
    const enabled = doc ? (doc.botEnabled === undefined ? !!doc.enabled : !!doc.botEnabled) : false;
    const endTime = doc ? (doc.botEndTime === undefined ? doc.endTime : doc.botEndTime) : null;
    const message = doc ? (doc.botMessage || doc.message) : '';

    // Not running: one line is the whole truth.
    if (!enabled) {
      return interaction.reply({
        content: '🟢 System is healthy — maintenance is not active.',
        flags: EPHEMERAL,
      });
    }

    // Running: state, remaining time and where the notice went. Table territory.
    const fields = [
      field('Message', message || 'The bot is under maintenance'),
      field('Remaining', endTime ? `<t:${Math.floor(endTime / 1000)}:R>` : 'No end time set'),
    ];
    if (doc.channelId) fields.push(field('Announcement', `<#${doc.channelId}>`));

    await interaction.reply({
      embeds: [notice({
        title: '🔴 Maintenance is active',
        description: 'All commands and protection systems are paused until maintenance ends.',
        color: C.warn,
        fields,
        footer: 'Kratos System',
        timestamp: true,
      })],
      flags: EPHEMERAL,
    });
  } catch (err) {
    console.error('[MaintenanceCmd] Failed to read status:', err.message);
    await interaction.reply(fail('Could not read the maintenance status.'));
  }
}