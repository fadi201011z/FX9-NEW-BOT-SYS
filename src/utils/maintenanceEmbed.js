import { notice, field, C } from './embeds.js';
import { formatDuration } from './parseDuration.js';

const NOTIFY_ROLE_ID = '1499393262476329020';

async function resolveChannel(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId)
    ?? client.channels.fetch(channelId).catch(() => null);
}

/** Turns a newline list from the dashboard into a quote block. */
const quoteLines = (text) => String(text)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => `> ${line}`)
  .join('\n');

export async function sendMaintenanceStart(client, channelId, message, endTime) {
  const channel = await resolveChannel(client, channelId);
  if (!channel) return;

  const remaining = endTime ? Math.max(0, endTime - Date.now()) : 0;

  try {
    await channel.send({
      content: `<@&${NOTIFY_ROLE_ID}> 🔔 **Maintenance started** — the bot is unavailable for now`,
      embeds: [notice({
        title: '🛠️ Maintenance in progress',
        color: 0xbf360c,
        thumbnail: client.user.displayAvatarURL({ size: 512 }),
        description: `🔴 **All services are temporarily unavailable.**\n\n`
          + `**📝 Notice** — ${message || 'The bot is under maintenance and development.'}`,
        fields: [
          field('🔹 What is happening?', 'The system is being updated and improved for better performance and reliability.', false),
          field('🔹 What is affected?', 'Yes — bot commands and protection systems may not work for a while.', false),
          field('🔹 When does it come back?', endTime
            ? `In **${formatDuration(remaining)}** — services resume automatically.`
            : 'No fixed end time was set. We will announce it as soon as it is done.', false),
        ],
        footer: 'Kratos System • Thanks for your patience',
        timestamp: true,
      })],
    });
  } catch (err) {
    console.error(`[MaintenanceEmbed] Could not send the start notice to ${channelId}:`, err.message);
  }
}

export async function sendMaintenanceEnd(client, channelId, durationMinutes, changelog) {
  const channel = await resolveChannel(client, channelId);
  if (!channel) return;

  const duration = durationMinutes > 0 ? `**${formatDuration(durationMinutes * 60_000)}**` : null;
  const cl = changelog || {};
  const botUpdates = (cl.botUpdates || '').trim();
  const siteUpdates = (cl.siteUpdates || '').trim();

  const fields = [
    field('🔹 Restored', [
      '✅ All bot commands — fully working',
      '✅ Protection systems — active',
      '✅ Ticket system — available',
      '✅ Temporary voice channels — enabled',
      '✅ Alerts and notifications — working',
      '✅ Dashboard — connected and in sync',
    ].join('\n'), false),
  ];

  if (duration) fields.push(field('⏱ Total downtime', duration, false));

  if (botUpdates) fields.push(field('📦 Bot updates', quoteLines(botUpdates).slice(0, 1024), false));
  if (siteUpdates) fields.push(field('🌐 Website updates', quoteLines(siteUpdates).slice(0, 1024), false));

  fields.push(field('📞 Problems?', 'If something still looks wrong, contact the support team.', false));

  try {
    await channel.send({
      content: `<@&${NOTIFY_ROLE_ID}> ✅ **Maintenance finished** — all services are available again`,
      embeds: [notice({
        title: '✅ Maintenance complete',
        color: C.ok,
        thumbnail: client.user.displayAvatarURL({ size: 512 }),
        description: '🟢 **All services are available again.**',
        fields,
        footer: 'Kratos System • Sorry for the interruption, and thanks for your patience',
        timestamp: true,
      })],
    });
  } catch (err) {
    console.error(`[MaintenanceEmbed] Could not send the end notice to ${channelId}:`, err.message);
  }
}