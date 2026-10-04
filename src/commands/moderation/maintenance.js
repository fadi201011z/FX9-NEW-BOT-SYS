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

    doc.enabled = true;
    doc.updatedAt = Date.now();
    doc.updatedBy = interaction.user.id;

    if (duration !== null && duration > 0) {
      doc.endTime = Date.now() + duration * 60 * 1000;
      doc.durationMinutes = duration;
    } else {
      doc.endTime = null;
      doc.durationMinutes = 0;
    }

    await doc.save();

    setMaintenancePresence(interaction.client, doc.message);

    if (doc.channelId) {
      await sendMaintenanceStart(interaction.client, doc.channelId, doc.message, doc.endTime);
    }

    await interaction.editReply({
      embeds: [modAction({
        kind: 'maintenance_start',
        description: doc.durationMinutes > 0
          ? `All commands and protection systems are paused for ${doc.durationMinutes} minute${doc.durationMinutes === 1 ? '' : 's'}.`
          : 'All commands and protection systems are paused until maintenance ends.',
        actor: userTag(interaction.user),
        fields: [
          field('Duration', doc.durationMinutes > 0
            ? `<t:${Math.floor(doc.endTime / 1000)}:R>`
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
    if (!doc || !doc.enabled) {
      return interaction.editReply(fail('Maintenance was not on.'));
    }

    const oldChannelId = doc.channelId || '';
    const oldDuration  = doc.durationMinutes || 0;

    doc.enabled = false;
    doc.endTime = null;
    doc.durationMinutes = 0;
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

    // Not running: one line is the whole truth.
    if (!doc || !doc.enabled) {
      return interaction.reply({
        content: '🟢 System is healthy — maintenance is not active.',
        flags: EPHEMERAL,
      });
    }

    // Running: state, remaining time and where the notice went. Table territory.
    const fields = [
      field('Message', doc.message || 'The bot is under maintenance'),
      field('Remaining', doc.endTime ? `<t:${Math.floor(doc.endTime / 1000)}:R>` : 'No end time set'),
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