import { Events, EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (member?.user.bot) return;

  // ══════════════════════════════════════════════════════════════════════════
  //  VOICE: Temp channel creation / deletion / ownership transfer
  // ══════════════════════════════════════════════════════════════════════════

  const { getGuildSetup, registerChannel, getChannel, deleteChannel, refreshPanel } = await import('../handlers/tempVoice.js');
  const { resetIdleTimer } = await import('../handlers/music.js');

  const setup = getGuildSetup(guild.id);

  // Auto-idle disconnect for music
  if (oldState.channelId) {
    const queue = newState.client?.musicQueues?.get?.(guild.id);
    if (queue && oldState.channelId === queue.voiceChannelId) {
      const vc     = guild.channels.cache.get(queue.voiceChannelId);
      const humans = vc?.members.filter(m => !m.user.bot).size ?? 0;
      if (humans === 0) resetIdleTimer(newState.client, guild.id);
    }
  }

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
        });

        await refreshPanel(newState.client, guild.id);
        console.log(`[TempVC] ✅ Created "${vc.name}" for ${member.user.tag}`);
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
              const msg = await textCh.send({
                embeds: [
                  new EmbedBuilder()
                    .setDescription(`👑 انتقلت ملكية **${vc.name}** إلى <@${newOwner.id}> تلقائياً`)
                    .setColor(0xfee75c)
                    .setFooter({ text: 'تُحذف هذه الرسالة خلال 20 ثانية' }),
                ],
              }).catch(() => null);
              const { default: autoDelete } = await import('../utils/autoDelete.js');
              if (msg && autoDelete) autoDelete(msg, 20);
            }
            console.log(`[TempVC] 👑 Ownership → ${newOwner.user.tag}`);
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

  let title, description, color;

  if (joined) {
    title       = '🎤  دخل قناة صوتية';
    description = `${member} انضم إلى **${newState.channel.name}**`;
    color       = Colors.VOICE;
  } else if (left) {
    title       = '🔇  غادر قناة صوتية';
    description = `${member} غادر **${oldState.channel.name}**`;
    color       = Colors.LEAVE;
  } else {
    title       = '🔀  تنقّل بين القنوات';
    description = `${member} انتقل من **${oldState.channel.name}** ← **${newState.channel.name}**`;
    color       = Colors.EDIT;
  }

  if (logCh) {
    const safeClient = newState.client || oldState.client;
    await logCh.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(description)
          .setThumbnail(member?.user.displayAvatarURL({ dynamic: true }) ?? null)
          .addFields({ name: '🆔  المعرّف', value: `\`${member?.user.id ?? 'N/A'}\``, inline: true })
          .setTimestamp()
          .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' })
      ],
    }).catch(() => {});
  }

  await updateStatusChannels(guild).catch(() => {});
}
