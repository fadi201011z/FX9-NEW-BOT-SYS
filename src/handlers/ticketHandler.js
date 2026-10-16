import {
  PermissionsBitField, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} from 'discord.js';
import {
  getGuildConfig, saveGuildConfig, getTicketByUser,
  saveTicket, getTicket, getAdminStats, saveAdminStats,
  getTicketByAdminChannel, reloadGuildConfig,
} from '../data/ticketDB.js';
import { C, EPHEMERAL, fail, field, logEntry, notice, ok, panelPayload, ticketButtons, ticketEmbed } from '../utils/embeds.js';
import { sendOrUpdateTicketLog } from '../utils/ticketLogUtils.js';
import { findSection, sectionFields } from '../data/ticketTypes.js';

const STYLE_MAP = { short: TextInputStyle.Short, paragraph: TextInputStyle.Paragraph };

const TICKET_NOT_FOUND = 'This ticket does not exist.';
const UNKNOWN_ACTION  = 'Unknown action.';

/**
 * One line back to the acting user, privately.
 *
 * A select menu acknowledges with `deferUpdate()`, which edits the public
 * message — so those must go through `followUp` with the ephemeral flag or the
 * error would be shown to the whole channel.
 */
async function replyOnce(interaction, payload) {
  if (interaction.isStringSelectMenu?.() ?? false) return interaction.followUp(payload);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ content: payload.content });
  }
  return interaction.reply(payload);
}

export async function handleCategorySelect(interaction) {
  // The menu's value is a section id — one the admin defined, or a built-in.
  // Anything else (an old message clicked after the section was deleted) is
  // refused rather than opened as a stray modal.
  const config = getGuildConfig(interaction.guildId);
  const section = findSection(config, interaction.values[0]);
  if (!section) {
    await interaction.reply(fail('Unknown ticket category.'));
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_${section.id}`)
    // Discord caps a modal title at 45 characters; a long section name is
    // trimmed here rather than rejected at send time.
    .setTitle(`${section.emoji || '📝'} ${section.label || section.id}`.slice(0, 45));

  // Duplicate input ids make Discord reject the whole modal, so they are made
  // unique as the components are built.
  const seenIds = new Set();
  for (const f of sectionFields(section)) {
    let id = /^[a-z0-9_]{1,32}$/.test(f.id) ? f.id : 'field';
    while (seenIds.has(id)) id = `${id.slice(0, 30)}_${seenIds.size}`;
    seenIds.add(id);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(String(f.label || 'Details').slice(0, 45))
          .setStyle(STYLE_MAP[f.style] ?? TextInputStyle.Short)
          .setPlaceholder(String(f.placeholder || '').slice(0, 100))
          .setRequired(!!f.required)
          .setMaxLength(Math.min(4000, Math.max(1, Number(f.maxLength) || 500))),
      ),
    );
  }

  await interaction.showModal(modal);
}

export async function handleTicketModalSubmit(client, interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const category = interaction.customId.replace('ticket_modal_', '');
  const { guildId, user } = interaction;
  if (!guildId) return;

  const existing = getTicketByUser(guildId, user.id);
  if (existing) {
    await interaction.editReply({
      content: `❌ You already have an open ticket: <#${existing.channelId}>\n`
        + 'Close it before opening another one.',
    });
    return;
  }

  const config = getGuildConfig(guildId);
  if (!config.ticketCategoryId) {
    await interaction.editReply({
      content: '❌ The ticket system is not set up yet. Ask an administrator to run '
        + '`/configt ticket_category`.',
    });
    return;
  }

  const section = findSection(config, category);
  const fields = sectionFields(section);

  // Read every input generically. With a custom section there is no fixed set of
  // ids, so a hard-coded `title`/`description` read would throw on the first
  // button an admin named something else.
  const values = {};
  for (const f of fields) {
    try { values[f.id] = interaction.fields.getTextInputValue(f.id); }
    catch { values[f.id] = ''; }
  }
  const pick = (...ids) => {
    for (const id of ids) {
      const v = values[id];
      if (v && v.trim()) return v.trim();
    }
    return '';
  };

  // The three ids the embed renders as their own lines keep their meaning when
  // present; otherwise the first answer becomes the title.
  const title = pick('title')
    || (fields[0] ? String(values[fields[0].id] || '').trim() : '')
    || (section?.label ?? 'Ticket');
  const description = pick('description');
  const evidence = pick('evidence') || undefined;

  // Everything else becomes a compact summary block on the ticket embed.
  const common = new Set(['title', 'description', 'evidence']);
  const extra = fields
    .filter((f) => !common.has(f.id))
    .map((f) => ({
      id: f.id,
      // Strip the leading emoji so the embed field name reads as plain text.
      label: String(f.label || '').replace(/^[^\s]+\s/, ''),
      value: String(values[f.id] || '').trim(),
    }))
    .filter((e) => e.value && e.value.trim());

  config.ticketCounter = (config.ticketCounter ?? 0) + 1;
  await saveGuildConfig(config);

  const ticketId = `KRS-${config.ticketCounter.toString().padStart(4, '0')}`;
  // The section id is already slug-shaped, but a hand-edited database row might
  // not be — this is the last place before it becomes a channel name.
  const slug = String(section?.id || category || 'ticket')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06ff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'ticket';
  const chanName = `${config.ticketCounter}-${slug}`;
  const guild = interaction.guild;

  // A section may hand its tickets to its own team; when it names none, the
  // guild-wide support roles apply, exactly as before.
  const supportRoleIds = (Array.isArray(section?.supportRoleIds) && section.supportRoleIds.length)
    ? section.supportRoleIds
    : (config.supportRoleIds ?? []);

  const userOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
      ],
    },
    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages,
      ],
    },
  ];

  if (supportRoleIds) {
    for (const roleId of supportRoleIds) {
      userOverwrites.push({
        id: roleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
        deny: [PermissionsBitField.Flags.SendMessages],
      });
    }
  }

  const userChannel = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    permissionOverwrites: userOverwrites,
    topic: `${ticketId} | ${title} | <@${user.id}>`,
  });

  let adminChannel = null;
  if (config.adminCategoryId) {
    const adminOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages,
        ],
      },
    ];
    if (supportRoleIds) {
      for (const roleId of supportRoleIds) {
        adminOverwrites.push({
          id: roleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles,
          ],
        });
      }
    }
    adminChannel = await guild.channels.create({
      name: `admin-${chanName}`,
      type: ChannelType.GuildText,
      parent: config.adminCategoryId,
      permissionOverwrites: adminOverwrites,
      topic: `[ADMIN] ${ticketId} | ${title} | Member: ${user.username}`,
    });
  }

  const ticket = {
    ticketId,
    channelId: userChannel.id,
    adminChannelId: adminChannel?.id,
    guildId,
    userId: user.id,
    username: user.username,
    category: section?.id ?? category,
    // The category's display is copied here so the ticket keeps reading the same
    // even after its section is renamed or deleted. Older tickets carry only
    // `category` and fall back to the built-in tables.
    categoryLabel: section ? `${section.emoji || ''} ${section.label || section.id}`.trim() : undefined,
    categoryEmoji: section?.emoji || undefined,
    categoryColor: section?.color || undefined,
    title,
    description,
    evidence,
    extra,
    priority: 'medium',
    status: 'open',
    openedAt: Date.now(),
    lastActivity: Date.now(),
    inactivityWarned: false,
  };
  await saveTicket(ticket);

  const supportMentions = supportRoleIds?.map((id) => `<@&${id}>`).join(' ') || '';

  const userMsg = await userChannel.send({
    content: `<@${user.id}>${supportMentions ? ` | ${supportMentions}` : ''}`,
    embeds: [ticketEmbed(ticket, false)],
    components: ticketButtons(false, undefined, false),
  });
  await userMsg.pin().catch(() => null);

  if (adminChannel) {
    const adminMsg = await adminChannel.send({
      content: supportMentions || undefined,
      embeds: [ticketEmbed(ticket, true)],
      components: ticketButtons(false, undefined, true),
    });
    await adminMsg.pin().catch(() => null);

    // A persistent reference card for staff: this channel mirrors the member's
    // ticket, so they always know where to answer.
    await adminChannel.send({
      embeds: [notice({
        title: '📡 Two-way relay',
        color: C.info,
        description: [
          `**Your replies here reach the member instantly.**`,
          `**Their messages are mirrored here automatically.**`,
        ].join('\n'),
        fields: [field('Member channel', `<#${userChannel.id}>`)],
        footer: 'Kratos System • Ticket relay',
      })],
    });
  }

  await interaction.editReply({
    content: adminChannel
      ? `✅ **Ticket opened:** <#${userChannel.id}>\n🔐 **Staff channel:** <#${adminChannel.id}>`
      : `✅ **Ticket opened:** <#${userChannel.id}>`,
  });

  await sendOrUpdateTicketLog(client, ticket);
}

export async function handleClaimTicket(client, interaction) {
  const isSelect = interaction.isStringSelectMenu?.() ?? false;
  if (isSelect) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: EPHEMERAL });

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const canClaim = (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id))
    || member.permissions.has(PermissionsBitField.Flags.ManageChannels);

  if (!canClaim) {
    await replyOnce(interaction, fail('You need the support role to claim a ticket.'));
    return;
  }

  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  if (!ticket) {
    await replyOnce(interaction, fail(TICKET_NOT_FOUND));
    return;
  }
  if (ticket.status === 'claimed') {
    await replyOnce(interaction, fail(`Already claimed by <@${ticket.claimedBy}>.`));
    return;
  }

  ticket.status = 'claimed';
  ticket.claimedBy = interaction.user.id;
  ticket.claimedByUsername = interaction.user.username;
  ticket.lastActivity = Date.now();
  await saveTicket(ticket);

  const stats = getAdminStats(interaction.user.id);
  stats.username = interaction.user.username;
  stats.claimed = (stats.claimed ?? 0) + 1;
  await saveAdminStats(stats);

  const isAdminChannel = interaction.channelId === ticket.adminChannelId;
  await interaction.message.edit({
    components: ticketButtons(true, interaction.user.username, isAdminChannel),
  });

  // Keep the two channels' buttons in agreement so staff never see a stale
  // "Claim" button on the mirrored channel.
  const otherChId = isAdminChannel ? ticket.channelId : ticket.adminChannelId;
  if (otherChId) {
    const otherCh = client.channels.cache.get(otherChId);
    if (otherCh) {
      const msgs = await otherCh.messages.fetch({ limit: 10 });
      const pinned = msgs.find((m) => m.pinned && m.author.id === client.user.id);
      if (pinned) {
        await pinned.edit({
          components: ticketButtons(true, interaction.user.username, !isAdminChannel),
        }).catch(() => null);
      }
    }
  }

  const logE = logEntry({
    kind: 'ticket_claimed',
    actor: `<@${interaction.user.id}>`,
    fields: [field('Ticket', ticket.ticketId)],
  });

  for (const chId of [ticket.channelId, ticket.adminChannelId].filter(Boolean)) {
    const ch = client.channels.cache.get(chId);
    await ch?.send({ embeds: [logE] });
  }

  await replyOnce(interaction, ok('Ticket claimed.'));

  await sendOrUpdateTicketLog(client, ticket);
}

export async function handleUnclaimTicket(client, interaction) {
  const isSelect = interaction.isStringSelectMenu?.() ?? false;
  if (isSelect) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: EPHEMERAL });

  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  if (!ticket) {
    await replyOnce(interaction, fail(TICKET_NOT_FOUND));
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isSupport = (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id))
    || member.permissions.has(PermissionsBitField.Flags.ManageChannels);

  if (ticket.claimedBy !== interaction.user.id && !isSupport) {
    await replyOnce(interaction, fail('You cannot release a ticket you have not claimed.'));
    return;
  }

  const prev = ticket.claimedBy;
  ticket.status = 'open';
  ticket.claimedBy = undefined;
  ticket.claimedByUsername = undefined;
  ticket.lastActivity = Date.now();
  await saveTicket(ticket);

  const isAdminChannel = interaction.channelId === ticket.adminChannelId;
  await interaction.message.edit({ components: ticketButtons(false, undefined, isAdminChannel) });

  const otherChId = isAdminChannel ? ticket.channelId : ticket.adminChannelId;
  if (otherChId) {
    const otherCh = client.channels.cache.get(otherChId);
    if (otherCh) {
      const msgs = await otherCh.messages.fetch({ limit: 10 });
      const pinned = msgs.find((m) => m.pinned && m.author.id === client.user.id);
      if (pinned) {
        await pinned.edit({
          components: ticketButtons(false, undefined, !isAdminChannel),
        }).catch(() => null);
      }
    }
  }

  const logE = logEntry({
    kind: 'ticket_released',
    actor: `<@${interaction.user.id}>`,
    fields: [
      field('Previous staff member', prev ? `<@${prev}>` : '—'),
      field('Ticket', ticket.ticketId),
    ],
  });
  for (const chId of [ticket.channelId, ticket.adminChannelId].filter(Boolean)) {
    const ch = client.channels.cache.get(chId);
    await ch?.send({ embeds: [logE] });
  }

  await sendOrUpdateTicketLog(client, ticket);
  await replyOnce(interaction, ok('Ticket released to the queue.'));
}

export async function handleRenameTicket(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_rename_modal')
    .setTitle('✏️ Rename ticket');

  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('new_name')
      .setLabel('New name (the ticket number is added automatically)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. payment-issue')
      .setRequired(true)
      .setMaxLength(40),
  ));

  await interaction.showModal(modal);
}

export async function handleRenameModalSubmit(client, interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const raw = interaction.fields.getTextInputValue('new_name');
  const slug = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    // Keeps ASCII plus Arabic letters, so a member can still name a ticket in
    // their own script — Discord has allowed non-Latin channel names since 2022.
    .replace(/[^a-z0-9\u0600-\u06ff-]/g, '')
    .slice(0, 40);

  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  const counter = ticket ? ticket.ticketId.split('-')[1] ?? '' : '';

  const finalName = counter ? `${parseInt(counter, 10)}-${slug}` : slug;
  const adminName = `admin-${finalName}`;

  const userCh = ticket ? client.channels.cache.get(ticket.channelId) : interaction.channel;
  await userCh?.setName(finalName).catch(() => null);

  if (ticket?.adminChannelId) {
    const adminCh = client.channels.cache.get(ticket.adminChannelId);
    await adminCh?.setName(adminName).catch(() => null);
  }

  if (ticket) {
    ticket.lastActivity = Date.now();
    await saveTicket(ticket);
  }

  await interaction.editReply({ content: `✅ Renamed to **${finalName}**.` });
}

/** Staff macros — sent verbatim into the member's channel. */
const QUICK_REPLIES = {
  reviewing:     '🔍 **We are reviewing your request.** We will get back to you shortly — please hold.',
  need_evidence: '📸 **Please send photos or additional evidence** so we can investigate further.',
  resolved:      '✅ **Your issue has been resolved.**\nIf anything else comes up, feel free to open a new ticket.',
  clarify:       '❓ **Could you describe the problem in more detail?** It will help us help you faster.',
  thanks:        '🙏 **Thanks for contacting the Kratos System team!**\nWe are always here to help.',
  transfer:      '🔄 **Your request is being transferred** to the team that handles it. Please wait.',
  known_issue:   '⚠️ **This is a known issue** and our team is already working on a fix. We will update you as soon as it ships.',
};

export async function handleQuickReply(client, interaction) {
  const config = getGuildConfig(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const allowed = (config.supportRoleIds ?? []).some((id) => member.roles.cache.has(id))
    || member.permissions.has(PermissionsBitField.Flags.ManageChannels);

  if (!allowed) {
    await interaction.reply(fail('Quick replies are for the support team only.'));
    return;
  }

  const reply = QUICK_REPLIES[interaction.values[0]];
  if (!reply) {
    await interaction.reply(fail('Unknown reply.'));
    return;
  }

  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  if (ticket) {
    const userCh = await client.channels.fetch(ticket.channelId).catch(() => null);
    await userCh?.send({ content: reply });
    ticket.lastActivity = Date.now();
    await saveTicket(ticket);
  }

  await interaction.reply(ok('Reply sent to the member.'));
}

// ── Dispatch ───────────────────────────────────────────────────────────────

/** Old per-button customIds, kept so already-pinned messages still work. */
const BUTTON_ACTION_MAP = {
  ticket_claim: 'claim',
  ticket_unclaim: 'unclaim',
  ticket_rename: 'rename',
  ticket_close: 'close',
};

/** Shared by the legacy buttons and the select menu — identical behaviour. */
async function runTicketAction(client, interaction, action) {
  switch (action) {
    case 'claim':
      return handleClaimTicket(client, interaction);
    case 'unclaim':
      return handleUnclaimTicket(client, interaction);
    case 'rename':
      return handleRenameTicket(interaction);
    case 'close': {
      const { handleCloseTicket } = await import('./closeHandler.js');
      return handleCloseTicket(client, interaction);
    }
    default:
      return interaction.reply(fail(UNKNOWN_ACTION));
  }
}

/** Touch the inactivity timer, then reject and look the ticket up. */
async function beginTicketInteraction(client, interaction) {
  const { updateTicketActivity } = await import('./inactivityHandler.js');
  updateTicketActivity(interaction.channelId);

  const ticket = getTicket(interaction.channelId) ?? getTicketByAdminChannel(interaction.channelId);
  if (!ticket) {
    await interaction.reply(fail(TICKET_NOT_FOUND));
    return null;
  }
  return ticket;
}

export async function handleTicketActionButton(client, interaction) {
  if (!await beginTicketInteraction(client, interaction)) return;
  return runTicketAction(client, interaction, BUTTON_ACTION_MAP[interaction.customId]);
}

export async function handleTicketActions(client, interaction) {
  if (!await beginTicketInteraction(client, interaction)) return;
  return runTicketAction(client, interaction, interaction.values[0]);
}

// ── Panels ─────────────────────────────────────────────────────────────────

/** True when a bot message carries the ticket category menu (the panel). */
function isPanelMessage(message) {
  return message.components?.some((row) =>
    row.components?.some((component) => component.customId === 'ticket_category'));
}

/** Refresh one guild's ticket panel (used when the dashboard saves the editor). */
export async function refreshGuildPanel(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  // The dashboard writes sections straight to Mongo; re-reading here is what
  // makes its `POST /api/panels/refresh` land the admin's change on the panel
  // (and on every modal opened afterwards) instead of the previous menu.
  const config = await reloadGuildConfig(guildId);
  if (!config?.panelChannelId) return false;

  try {
    const ch = guild.channels.cache.get(config.panelChannelId);
    if (!ch) return false;

    const messages = await ch.messages.fetch({ limit: 10 });
    // The panel is recognised by its category menu rather than its attachment:
    // in embed mode there is no `panel.png` file to look for.
    const existing = messages.find((m) => m.author.id === client.user.id
      && (isPanelMessage(m) || m.attachments.first()?.name === 'panel.png'));

    if (existing) await existing.edit(panelPayload(guildId));
    else await ch.send(panelPayload(guildId));

    return true;
  } catch {
    return false;
  }
}

/** Called on startup — rebuilds every guild's panel from live data. */
export async function restoreAllPanels(client) {
  let restored = 0;
  for (const [, guild] of client.guilds.cache) {
    if (await refreshGuildPanel(client, guild.id)) restored++;
  }
  if (restored > 0) console.log(`  🎫  Restored ${restored} ticket panel(s)`);
}