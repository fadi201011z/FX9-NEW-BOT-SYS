import { Events, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { logEntry, field, userTag } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import Maintenance from '../models/Maintenance.js';
import { isEnabled } from '../utils/features.js';

const DEV_ID = process.env.BOT_DEVELOPER_ID || null;

async function isMaintenanceBlocked(member, guild) {
  try {
    const doc = await Maintenance.findOne().lean();
    if (!doc) return false;
    // Bot half of the maintenance document; fall back to the legacy single
    // `enabled` for documents the dashboard has not rewritten yet.
    const enabled = doc.botEnabled === undefined ? !!doc.enabled : !!doc.botEnabled;
    const endTime = doc.botEndTime === undefined ? doc.endTime : doc.botEndTime;
    if (!enabled) return false;
    if (endTime && Date.now() >= endTime) {
      await Maintenance.updateOne({ _id: doc._id }, { $set: { botEnabled: false, botEndTime: null, botDurationMinutes: 0 } });
      return false;
    }
    const bypass = (DEV_ID && member.id === DEV_ID) || guild.ownerId === member.id;
    return !bypass;
  } catch { return false; }
}

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (member?.user.bot) return;
  if (await isMaintenanceBlocked(member, guild)) return;

  // ══════════════════════════════════════════════════════════════════════════
  //  VOICE: Temp channel creation / deletion / ownership transfer
  // ══════════════════════════════════════════════════════════════════════════

  const { getGuildSetup, registerChannel, getChannel, deleteChannel, refreshPanel } = await import('../handlers/tempVoice.js');

  // Temp-voice is a switchboard feature: when it is off, `setup` reads as absent
  // so the whole create/delete/transfer block below is skipped — while the
  // voice-state logging underneath still runs.
  const setup = isEnabled('temp_voice') ? getGuildSetup(guild.id) : null;

  if (setup) {
    // Member joined Join-to-Create channel
    if (newState.channelId === setup.joinChannelId) {
      try {
        const vc = await guild.channels.create({
          name:   `🔊 ${member.displayName}`,
          type:   ChannelType.GuildVoice,
          parent: setup.categoryId,
          permissionOverwrites: [
            {
              id:   guild.id,
              allow: [PermissionFlagsBits.ViewChannel],
              deny:  [PermissionFlagsBits.Connect],
            },
            {
              id:    member.id,
              allow: [
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.Stream,
              ],
            },
            {
              id:    newState.client.user.id,
              allow: [
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.MoveMembers,
              ],
            },
          ],
        });

        await member.voice.setChannel(vc).catch(() => {});

        await registerChannel(vc.id, {
          ownerId:       member.id,
          guildId:       guild.id,
          textChannelId: setup.textChannelId,
          name:          vc.name,
        });

        await refreshPanel(newState.client, guild.id);
        console.log(`[TempVC] ✅ Created "${vc.name}" for ${userTag(member.user)}`);
      } catch (err) {
        console.error('[TempVC] ❌ Create error:', err.message);
      }
      return;
    }

    // Member left a temp VC
    if (oldState.channelId && oldState.channelId !== setup.joinChannelId) {
      const chData = getChannel(oldState.channelId);
      if (chData) {
        const vc = guild.channels.cache.get(oldState.channelId);

        // Empty → delete channel
        if (!vc || vc.members.size === 0) {
          try {
            if (vc) await vc.delete('Empty temp VC').catch(() => {});
            await deleteChannel(oldState.channelId);
            await refreshPanel(newState.client, guild.id);
            console.log(`[TempVC] 🗑️ Deleted: ${oldState.channelId}`);
          } catch (err) {
            console.error('[TempVC] ❌ Delete error:', err.message);
          }
          return;
        }

        // Owner left → transfer to next non-bot member
        if (chData.ownerId === oldState.member?.id) {
          const newOwner = vc.members.filter(m => !m.user.bot).first();
          if (newOwner) {
            chData.ownerId = newOwner.id;
            const textCh = guild.channels.cache.get(chData.textChannelId);
            if (textCh) {
              // One sentence, so plain text — an embed would be noise here.
              const msg = await textCh.send({
                content: `👑 <@${newOwner.id}> is now the owner of **${vc.name}** · *this message deletes itself in 20 seconds*`,
              }).catch(() => null);
              const { default: autoDelete } = await import('../utils/autoDelete.js');
              if (msg && autoDelete) autoDelete(msg, 20);
            }
            console.log(`[TempVC] 👑 Ownership → ${userTag(newOwner.user)}`);
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SYS: Voice state logging (join / leave / switch)
  // ══════════════════════════════════════════════════════════════════════════

  const logCh = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));

  const joined   = !oldState.channel && newState.channel;
  const left     = oldState.channel && !newState.channel;
  const switched = oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id;

  if (!joined && !left && !switched) return;

  let kind, detail;

  if (joined) {
    kind   = 'voice_join';
    detail = `Joined **${newState.channel.name}**`;
  } else if (left) {
    kind   = 'voice_leave';
    detail = `Left **${oldState.channel.name}**`;
  } else {
    kind   = 'voice_switch';
    detail = `Moved from **${oldState.channel.name}** to **${newState.channel.name}**`;
  }

  if (logCh && isEnabled('logging')) {
    void logCh.send({
      embeds: [logEntry({
        kind,
        target: `${member} (\`${member?.user.id ?? 'N/A'}\`)`,
        fields: [field('Channel', detail, false)],
        footer: 'Kratos System • Server log',
      })],
    }).catch(() => {});
  }

  updateStatusChannels(guild, { fetchMembers: false }).catch(() => {});
}
