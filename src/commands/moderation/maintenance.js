import { SlashCommandBuilder } from 'discord.js';
import Maintenance from '../../models/Maintenance.js';
import { setMaintenancePresence, clearMaintenancePresence } from '../../utils/presence.js';
import { sendMaintenanceStart, sendMaintenanceEnd } from '../../utils/maintenanceEmbed.js';
import { ok, fail, notice, field, C, EPHEMERAL } from '../../utils/embeds.js';
import { ROLES } from '../../config/roles.js';

const DEV_ID = process.env.BOT_DEVELOPER_ID || null;

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
  await interaction.deferReply({ flags: EPHEMERAL });

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

    await interaction.editReply(ok(
      doc.durationMinutes > 0
        ? `Maintenance is on for ${doc.durationMinutes} minute${doc.durationMinutes === 1 ? '' : 's'} — all services are paused.`
        : 'Maintenance is on indefinitely — all services are paused.'
    ));
  } catch (err) {
    console.error('[MaintenanceCmd] Failed to start maintenance:', err.message);
    await interaction.editReply({ content: `❌ Could not start maintenance: ${err.message}` });
  }
}

async function handleStop(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });

  try {
    const doc = await Maintenance.findOne();
    if (!doc || !doc.enabled) {
      return interaction.editReply({ content: '⚠️ Maintenance was not on.' });
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

    await interaction.editReply(ok('Maintenance is off — all services are live again.'));
  } catch (err) {
    console.error('[MaintenanceCmd] Failed to stop maintenance:', err.message);
    await interaction.editReply({ content: `❌ Could not stop maintenance: ${err.message}` });
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