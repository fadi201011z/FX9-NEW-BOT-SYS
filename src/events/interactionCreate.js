import {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  OverwriteType,
} from 'discord.js';
import { isCommandEnabled, canMemberUseCommand } from '../database.js';
import { ok, fail, notice, field, C, EPHEMERAL } from '../utils/embeds.js';
import {
  HELP_SECTIONS,
  SETUP_SECTIONS,
  commandFields,
  staticFields,
} from '../utils/menuContent.js';
import { commandModules } from '../config/commandLoader.js';
import Maintenance from '../models/Maintenance.js';
import { ROLES } from '../config/roles.js';
import { getFeature, featureForCommand, featureForComponent, FEATURE_NAMES } from '../utils/features.js';

const DEV_ID = process.env.BOT_DEVELOPER_ID || null;

async function isMaintenanceActive() {
  try {
    const doc = await Maintenance.findOne().lean();
    if (!doc) return false;
    // The document now carries two independent halfs. `botEnabled` gates the
    // bot; before the dashboard ever saved it, an old doc only had `enabled`
    // (the site switch), so fall back to it for those.
    const enabled = doc.botEnabled === undefined ? !!doc.enabled : !!doc.botEnabled;
    const endTime = doc.botEndTime === undefined ? doc.endTime : doc.botEndTime;
    const message = doc.botMessage || doc.message;
    if (!enabled) return false;
    if (endTime && Date.now() >= endTime) {
      await Maintenance.updateOne({ _id: doc._id }, { $set: { botEnabled: false, botEndTime: null, botDurationMinutes: 0 } });
      return false;
    }
    return message || 'The bot is under maintenance and development. Please check back later.';
  } catch { return false; }
}

function canBypassMaintenance(member) {
  if (DEV_ID && member.id === DEV_ID) return true;
  if (member.guild?.ownerId === member.id) return true;
  return member.roles?.cache?.has(ROLES.DEVELOPER[0]) || false;
}

const MAINTENANCE_NOTE = 'We are improving the bot. We will be back shortly.';

async function blockIfMaintenance(interaction) {
  if (!interaction.guildId || !interaction.member) return false;
  const mntMsg = await isMaintenanceActive();
  if (mntMsg && !canBypassMaintenance(interaction.member)) {
    const payload = {
      content: `🔧 **${mntMsg}**\n> ${MAINTENANCE_NOTE}`,
      flags: EPHEMERAL,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
    return true;
  }
  return false;
}

// ─── Feature switchboard ───────────────────────────────────────────────────
// Every slash command and every ticket/temp-voice component is owned by a
// feature. If the dashboard set that feature to `off` the interaction is
// refused outright; if it is under `maintenance` the user sees the feature's
// own message. Developers and the guild owner can still use a feature that is
// only under maintenance (handy for verifying a fix) but not a disabled one.
const FEATURE_DISABLED_NOTE = 'هذه الخصيصة معطّلة حالياً من قبل الإدارة.';

async function blockIfFeature(interaction, key) {
  if (!key) return false;
  const f = getFeature(key);
  if (f.state === 'on') return false;
  if (f.state === 'maintenance' && interaction.member && canBypassMaintenance(interaction.member)) return false;

  const name = FEATURE_NAMES[key] || key;
  const content = f.state === 'maintenance'
    ? `🔧 **${name}** قيد الصيانة مؤقتاً.
> ${f.message || 'نعمل على تحسينها، سنعود قريباً.'}`
    : `🚫 ${FEATURE_DISABLED_NOTE}\n> **${name}**`;

  const payload = { content, flags: EPHEMERAL };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
  return true;
}

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  try {

    // ══════════════════════════════════════════════════════════════════════
    //  Slash Commands
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.client.commands.get(interaction.commandName);
      if (!cmd) return;

      // ── Maintenance mode check ────────────────────────────────────────────
      if (interaction.guildId && interaction.member) {
        const mntMsg = await isMaintenanceActive();
        if (mntMsg && !canBypassMaintenance(interaction.member)) {
          await interaction.reply({
            content: `🔧 **${mntMsg}**\n> ${MAINTENANCE_NOTE}`,
            flags: EPHEMERAL,
          }).catch(() => {});
          return;
        }
      }

      // ── Feature switchboard ───────────────────────────────────────────────
      if (await blockIfFeature(interaction, await featureForCommand(interaction.commandName))) {
        return;
      }

      if (interaction.guildId && !isCommandEnabled(interaction.guildId, interaction.commandName)) {
        await interaction.reply(fail(`\`/${interaction.commandName}\` is currently disabled in this server.`));
        return;
      }

      if (interaction.guildId && interaction.member) {
        const memberRoles = interaction.member.roles?.cache?.map((r) => r.id) || [];
        if (!canMemberUseCommand(interaction.guildId, interaction.commandName, memberRoles)) {
          await interaction.reply(fail(`You do not have permission to use \`/${interaction.commandName}\` in this server.`));
          return;
        }
      }

      try {
        await cmd.execute(interaction, interaction.client);
      } catch (err) {
        // If cmd.execute took only 1 arg, the 2nd will be silently ignored
        // If it still threw, try without client
        if (err && !err.message?.includes?.('is not a function')) {
          try { await cmd.execute(interaction); return; } catch {}
        }
        throw err;
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  String Select Menus
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu()) {
      if (await blockIfMaintenance(interaction)) return;
      if (await blockIfFeature(interaction, featureForComponent(interaction.customId))) return;
      const { handleCategorySelect, handleQuickReply } = await import('../handlers/ticketHandler.js');

      if (interaction.customId === 'ticket_category') {
        return handleCategorySelect(interaction);
      }
      if (interaction.customId === 'ticket_quickreply') {
        return handleQuickReply(interaction.client, interaction);
      }
      if (interaction.customId === 'ticket_actions') {
        const { handleTicketActions } = await import('../handlers/ticketHandler.js');
        return handleTicketActions(interaction.client, interaction);
      }

      if (interaction.customId === 'ticket_log_menu') {
        const { handleTicketLogMenu } = await import('../handlers/ticketLogMenu.js');
        return handleTicketLogMenu(interaction.client, interaction);
      }

      // ═══════════════════════════════════════════════════════════════
      //  Help menu
      // ═══════════════════════════════════════════════════════════════
      if (interaction.customId === 'help_menu') {
        const section = HELP_SECTIONS.find((s) => s.value === interaction.values[0]);
        if (!section) return interaction.reply(fail('Unknown help section.'));

        // Command lists come from the loaded modules, so this page cannot
        // advertise a command the bot does not have, nor omit one it does.
        const modules = await commandModules();
        const fields = [
          ...commandFields(modules, section.folders),
          ...staticFields(section),
        ];

        return interaction.reply({
          embeds: [notice({
            title: section.title,
            description: section.blurb,
            color: C.info,
            fields,
            footer: 'Kratos System • Help',
            timestamp: true,
          })],
          flags: EPHEMERAL,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      //  Heartbeat Menu
      // ═══════════════════════════════════════════════════════════════
      if (interaction.customId.startsWith('hb_cat_')) {
        const { handleHeartbeatSelect } = await import('../utils/botLogger.js');
        return handleHeartbeatSelect(interaction);
      }

      // ═══════════════════════════════════════════════════════════════
      //  Setup menu
      // ═══════════════════════════════════════════════════════════════
      if (interaction.customId === 'setup_menu') {
        const section = SETUP_SECTIONS.find((s) => s.value === interaction.values[0]);
        if (!section) return interaction.reply(fail('Unknown setup section.'));

        // `groups` holds either a string or an array of lines.
        const fields = section.groups.map(([name, body]) => field(
          name,
          Array.isArray(body) ? body.join('\n') : body,
          false,
        ));

        return interaction.reply({
          embeds: [notice({
            title: section.title,
            description: section.blurb,
            color: C.info,
            fields,
            footer: 'Kratos System • Setup',
            timestamp: true,
          })],
          flags: EPHEMERAL,
        });
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Modal Submissions
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      if (await blockIfMaintenance(interaction)) return;
      if (await blockIfFeature(interaction, featureForComponent(interaction.customId))) return;
      const id = interaction.customId;

      // Ticket modals
      if (id.startsWith('ticket_modal_')) {
        const { handleTicketModalSubmit } = await import('../handlers/ticketHandler.js');
        return handleTicketModalSubmit(interaction.client, interaction);
      }
      if (id === 'ticket_rename_modal') {
        const { handleRenameModalSubmit } = await import('../handlers/ticketHandler.js');
        return handleRenameModalSubmit(interaction.client, interaction);
      }

      // Temp Voice modals — every one of these replies with a single line, so
      // they are plain ephemeral text. An embed carried one sentence and a
      // colour bar, and nothing else.
      if (id === 'modal_vc_limit') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const val = parseInt(interaction.fields.getTextInputValue('limit_value'), 10);
        if (isNaN(val) || val < 0 || val > 99) {
          return interaction.reply(fail('Enter a number between 0 and 99.'));
        }
        await vc.setUserLimit(val);
        return interaction.reply(ok(
          `Member limit for **${vc.name}** set to ${val === 0 ? 'unlimited' : val}.`
        ));
      }

      if (id === 'modal_vc_rename') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const name = interaction.fields.getTextInputValue('rename_value').trim();
        if (!name) return interaction.reply(fail('The name cannot be empty.'));
        await vc.setName(name);
        return interaction.reply(ok(`Your channel is now named **${name}**.`));
      }

      if (id === 'modal_vc_kick') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const targetId = interaction.fields.getTextInputValue('kick_id').trim();
        const target = vc.members.get(targetId);
        if (!target) return interaction.reply(fail('That member is not in your channel.'));
        if (target.id === interaction.member.id) return interaction.reply(fail('You cannot kick yourself.'));
        await target.voice.disconnect();
        return interaction.reply(ok(`Kicked **${target.displayName}** from your channel.`));
      }

      if (id === 'modal_vc_transfer') {
        const { resolveOwnedChannel, getChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const targetId = interaction.fields.getTextInputValue('transfer_id').trim();
        const target = vc.members.get(targetId);
        if (!target) return interaction.reply(fail('That member is not in your channel.'));
        if (target.user.bot) return interaction.reply(fail('Ownership cannot be transferred to a bot.'));
        if (target.id === interaction.member.id) return interaction.reply(fail('You already own this channel.'));
        const chData = getChannel(owned.vcId);
        if (chData) chData.ownerId = target.id;
        return interaction.reply(ok(`Ownership of **${vc.name}** transferred to **${target.displayName}**.`));
      }

      if (id === 'modal_vc_permit' || id === 'modal_vc_reject' || id === 'modal_vc_invite') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));

        const targetId = interaction.fields.getTextInputValue('target_id').trim();
        const target = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!target) return interaction.reply(fail('That user ID is not a member of this server.'));
        if (target.id === interaction.member.id) return interaction.reply(fail('That is you.'));
        if (target.user.bot) return interaction.reply(fail('That is a bot.'));

        if (id === 'modal_vc_permit') {
          await vc.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
          return interaction.reply(ok(`**${target.displayName}** can now join **${vc.name}**.`));
        }

        if (id === 'modal_vc_reject') {
          await vc.permissionOverwrites.edit(target.id, { Connect: false, ViewChannel: false });
          if (target.voice?.channelId === vc.id) await target.voice.disconnect().catch(() => {});
          return interaction.reply(ok(`**${target.displayName}** can no longer join **${vc.name}**.`));
        }

        // Invite: permit, then ping them in the panel's text channel with a
        // link, so the invitation is actually noticed instead of silent.
        await vc.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
        const inviteCh = interaction.guild.channels.cache.get(owned.textChannelId);
        if (inviteCh) {
          const msg = await inviteCh.send({
            content: `🔗 <@${target.id}> you have been invited to join **${vc.name}** — <#${vc.id}>`,
          }).catch(() => null);
          const { default: autoDelete } = await import('../utils/autoDelete.js');
          if (msg && autoDelete) autoDelete(msg, 30);
        }
        return interaction.reply(ok(`Invited **${target.displayName}** to **${vc.name}**.`));
      }

      if (id === 'modal_vc_bitrate') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const val = parseInt(interaction.fields.getTextInputValue('bitrate_value'), 10);
        if (isNaN(val) || val < 8 || val > 384) {
          return interaction.reply(fail('Enter a bitrate between 8 and 384 kbps.'));
        }
        try {
          await vc.setBitrate(val * 1000);
        } catch {
          return interaction.reply(fail('That bitrate is not allowed here — higher values need a booster level.'));
        }
        return interaction.reply(ok(`Bitrate for **${vc.name}** set to ${val} kbps.`));
      }

      if (id === 'modal_vc_region') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const raw = interaction.fields.getTextInputValue('region_value').trim().toLowerCase();
        try {
          await vc.setRTCRegion(raw || null);
        } catch {
          return interaction.reply(fail('Unknown region. Try e.g. **europe**, **us-east** or **brazil**.'));
        }
        return interaction.reply(ok(
          raw ? `Region for **${vc.name}** set to **${raw}**.` : `Region for **${vc.name}** reset to automatic.`
        ));
      }

      if (id === 'modal_vc_summon') {
        const { resolveOwnedChannel } = await import('../handlers/tempVoice.js');
        const owned = resolveOwnedChannel(interaction.guildId, interaction.member);
        const vc = owned ? interaction.guild.channels.cache.get(owned.vcId) : null;
        if (!vc) return interaction.reply(fail('You do not have an active voice channel.'));
        const targetId = interaction.fields.getTextInputValue('target_id').trim();
        const target = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!target) return interaction.reply(fail('That user ID is not a member of this server.'));
        if (target.user.bot) return interaction.reply(fail('That is a bot.'));
        if (!target.voice?.channelId) return interaction.reply(fail('That member is not in a voice channel.'));
        await target.voice.setChannel(vc).catch(() => {});
        return interaction.reply(ok(`Brought **${target.displayName}** into **${vc.name}**.`));
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Buttons
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      if (await blockIfMaintenance(interaction)) return;
      if (await blockIfFeature(interaction, featureForComponent(interaction.customId))) return;
      const id = interaction.customId;

      // ── Rating buttons (ticket system) ──────────────────────────────
      if (id.startsWith('rate_')) {
        const { handleRatingButton } = await import('../handlers/closeHandler.js');
        return handleRatingButton(interaction.client, interaction);
      }

      // ── Old ticket buttons (backward compatibility) ─────────────────
      if (['ticket_claim', 'ticket_unclaim', 'ticket_rename', 'ticket_close'].includes(id)) {
        const { handleTicketActionButton } = await import('../handlers/ticketHandler.js');
        return handleTicketActionButton(interaction.client, interaction);
      }

      // ── Temp Voice buttons ──────────────────────────────────────────
      if (id.startsWith('vc_')) {
        const { resolveOwnedChannel, getChannel, deleteChannel, registerChannel } = await import('../handlers/tempVoice.js');
        const { checkCooldown } = await import('../utils/cooldown.js');
        const member = interaction.member;

        const rem = checkCooldown(member.id, id);
        if (rem > 0) {
          return interaction.reply({ content: `⏳ Wait **${(rem / 1000).toFixed(1)}s**.`, flags: EPHEMERAL });
        }

        try {
          // Claim is the one action a non-owner may take: you take over a room
          // whose owner has left. It resolves the room from where you are
          // standing, not from ownership, so it runs before the owner gate.
          if (id === 'vc_claim') {
            const currentId = member.voice?.channelId;
            const claimVc = currentId ? interaction.guild.channels.cache.get(currentId) : null;
            const chData = currentId ? getChannel(currentId) : null;
            if (!claimVc || !chData) {
              return interaction.reply(fail('Join the voice channel you want to claim first.'));
            }
            if (chData.ownerId === member.id) {
              return interaction.reply(fail('You already own this channel.'));
            }
            if (claimVc.members.has(chData.ownerId)) {
              return interaction.reply(fail('The owner is still here — you can claim it once they leave.'));
            }
            chData.ownerId = member.id;
            await claimVc.permissionOverwrites.edit(member.id, {
              Connect: true, Speak: true, ManageChannels: true, Stream: true,
            }).catch(() => {});
            return interaction.reply(ok(`You are now the owner of **${claimVc.name}**.`));
          }

          const owned = resolveOwnedChannel(interaction.guildId, member);
          if (!owned) {
            return interaction.reply(fail(
              'You do not have an active voice channel. Join the ➕ channel to create one first.'
            ));
          }

          const vc = interaction.guild.channels.cache.get(owned.vcId);
          if (!vc) {
            // Clean up the stale record rather than leaving it to fail forever.
            deleteChannel(owned.vcId);
            return interaction.reply(fail(
              'Your channel no longer exists. Join the ➕ channel to create a new one.'
            ));
          }

          if (id === 'vc_lock') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
            return interaction.reply(ok(`Locked **${vc.name}** — nobody can join.`));
          }

          if (id === 'vc_unlock') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
            return interaction.reply(ok(`Unlocked **${vc.name}** for everyone.`));
          }

          if (id === 'vc_hide') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
            return interaction.reply(ok(`Hid **${vc.name}**.`));
          }

          if (id === 'vc_show') {
            await vc.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
            return interaction.reply(ok(`Revealed **${vc.name}**.`));
          }

          if (id === 'vc_info') {
            // Read the current state straight off the channel's overwrites so
            // the card cannot lie about lock/hide.
            const ow = vc.permissionOverwrites.cache.get(interaction.guild.id);
            const locked = ow ? ow.deny.has(PermissionFlagsBits.Connect) : false;
            const hidden = ow ? ow.deny.has(PermissionFlagsBits.ViewChannel) : false;
            const humans = vc.members.filter((m) => !m.user.bot).size;
            return interaction.reply({
              embeds: [notice({
                title: `ℹ️ ${vc.name}`,
                color: C.accent,
                fields: [
                  field('Owner', `<@${owned.ownerId}>`),
                  field('Members', `${humans}${vc.userLimit ? ` / ${vc.userLimit}` : ' / ∞'}`),
                  field('Access', locked ? '🔒 Locked' : '🔓 Open'),
                  field('Visibility', hidden ? '🙈 Hidden' : '👁️ Visible'),
                  field('Limit', vc.userLimit ? String(vc.userLimit) : 'Unlimited'),
                  field('Created', `<t:${Math.floor((vc.createdTimestamp || Date.now()) / 1000)}:R>`),
                ],
                footer: 'Kratos System • Temp voice',
                timestamp: true,
              })],
              flags: EPHEMERAL,
            });
          }

          if (id === 'vc_limit') {
            const modal = new ModalBuilder().setCustomId('modal_vc_limit').setTitle('Set member limit');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('limit_value')
                .setLabel('Maximum members (0 = unlimited)')
                .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2)
                .setPlaceholder('e.g. 5').setRequired(true)
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_rename') {
            const modal = new ModalBuilder().setCustomId('modal_vc_rename').setTitle('Rename channel');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('rename_value')
                .setLabel('New name').setStyle(TextInputStyle.Short)
                .setMaxLength(32).setRequired(true)
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_kick') {
            const modal = new ModalBuilder().setCustomId('modal_vc_kick').setTitle('Kick a member');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('kick_id')
                .setLabel('Member user ID')
                .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
                .setPlaceholder('e.g. 123456789012345678')
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_transfer') {
            const modal = new ModalBuilder().setCustomId('modal_vc_transfer').setTitle('Transfer ownership');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('transfer_id')
                .setLabel('New owner user ID')
                .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
                .setPlaceholder('e.g. 123456789012345678')
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_permit' || id === 'vc_reject' || id === 'vc_invite') {
            const meta = {
              vc_permit: { custom: 'modal_vc_permit', title: 'Permit a member' },
              vc_reject: { custom: 'modal_vc_reject', title: 'Reject a member' },
              vc_invite: { custom: 'modal_vc_invite', title: 'Invite a member' },
            }[id];
            const modal = new ModalBuilder().setCustomId(meta.custom).setTitle(meta.title);
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('target_id')
                .setLabel('Member user ID')
                .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
                .setPlaceholder('e.g. 123456789012345678')
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_bitrate') {
            const modal = new ModalBuilder().setCustomId('modal_vc_bitrate').setTitle('Set channel bitrate');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('bitrate_value')
                .setLabel('Bitrate in kbps (8–96, boosted up to 384)')
                .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(3)
                .setPlaceholder('e.g. 64').setRequired(true)
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_region') {
            const modal = new ModalBuilder().setCustomId('modal_vc_region').setTitle('Set voice region');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('region_value')
                .setLabel('Region name — leave blank for automatic')
                .setStyle(TextInputStyle.Short).setMaxLength(32).setRequired(false)
                .setPlaceholder('e.g. europe, us-east, brazil')
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_clone') {
            const clone = await vc.clone({ reason: `Temp voice cloned by ${member.user.tag}` }).catch(() => null);
            if (!clone) return interaction.reply(fail('Could not clone your channel — check my permissions.'));
            await registerChannel(clone.id, {
              guildId: interaction.guildId,
              ownerId: member.id,
              textChannelId: owned.textChannelId,
              createdAt: Date.now(),
            });
            if (member.voice?.channelId) await member.voice.setChannel(clone).catch(() => {});
            return interaction.reply(ok(`Cloned **${vc.name}** into <#${clone.id}>.`));
          }

          if (id === 'vc_summon') {
            const modal = new ModalBuilder().setCustomId('modal_vc_summon').setTitle('Bring a member in');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('target_id')
                .setLabel('Member user ID')
                .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
                .setPlaceholder('e.g. 123456789012345678')
            ));
            return interaction.showModal(modal);
          }

          if (id === 'vc_muteall' || id === 'vc_unmuteall') {
            const mute = id === 'vc_muteall';
            const targets = vc.members.filter((m) => !m.user.bot && m.id !== member.id);
            let changed = 0;
            for (const m of targets.values()) {
              if (!!m.voice.serverMute === mute) continue;
              await m.voice.setMute(mute, `Room ${mute ? 'mute' : 'unmute'} by owner`).then(() => { changed++; }).catch(() => {});
            }
            return interaction.reply(ok(
              `${mute ? '🔇 Muted' : '🔊 Unmuted'} **${changed}** member(s) in **${vc.name}**.`
            ));
          }

          if (id === 'vc_deafenall' || id === 'vc_undeafenall') {
            const deaf = id === 'vc_deafenall';
            const targets = vc.members.filter((m) => !m.user.bot && m.id !== member.id);
            let changed = 0;
            for (const m of targets.values()) {
              if (!!m.voice.serverDeaf === deaf) continue;
              await m.voice.setDeaf(deaf, `Room ${deaf ? 'deafen' : 'undeafen'} by owner`).then(() => { changed++; }).catch(() => {});
            }
            return interaction.reply(ok(
              `${deaf ? '🎧 Deafened' : '👂 Undeafened'} **${changed}** member(s) in **${vc.name}**.`
            ));
          }

          if (id === 'vc_reset') {
            // Put @everyone back to inheriting, then drop the per-member
            // overrides, so a room that has been locked, hidden, permitted and
            // rejected can return to a clean slate in one click.
            await vc.permissionOverwrites.edit(interaction.guild.id, {
              Connect: null, ViewChannel: null, Speak: null, Stream: null,
            }).catch(() => {});
            const memberOverwrites = vc.permissionOverwrites.cache.filter((o) => o.type === OverwriteType.Member);
            for (const o of memberOverwrites.values()) {
              await vc.permissionOverwrites.delete(o.id, 'Room permissions reset by owner').catch(() => {});
            }
            return interaction.reply(ok(`Reset permissions on **${vc.name}**.`));
          }

          if (id === 'vc_delete') {
            const confirm = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('vc_delete_confirm')
                .setLabel('Confirm delete').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
            );
            return interaction.reply({
              content: `⚠️ Delete **${vc.name}**? Everyone inside will be disconnected.`,
              components: [confirm],
              flags: EPHEMERAL,
            });
          }

          if (id === 'vc_delete_confirm') {
            await deleteChannel(owned.vcId);
            await vc.delete('Owner deleted their temp voice channel').catch(() => {});
            return interaction.update({ content: '✅ Your channel has been deleted.', embeds: [], components: [] });
          }
        } catch (err) {
          console.error('[TempVC Button]', err.message);
          return interaction.reply(fail('Something went wrong — check the bot’s permissions.'));
        }
      }

      return;
    }

  } catch (error) {
    console.error('[Interaction Error]', error);

    // Kept to one line and no stack trace: this is user-facing, and the console
    // already has the full error for the developer.
    const opts = fail('Something went wrong while running that command. Please try again.');

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(opts).catch(() => {});
      } else {
        await interaction.reply(opts).catch(() => {});
      }
    } catch { /* the interaction is already gone */ }
  }
}
