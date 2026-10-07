import { Events } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { logEntry, field, userTag } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import { recordLeave } from '../utils/guildStats.js';

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member) {
  const { guild } = member;

  // First statement on purpose: everything below bails when the server has no
  // log channel, and a departure from such a server is still a departure. The
  // daily leave count must not depend on how the server is configured.
  recordLeave(guild.id, guild.memberCount);

  const logCh = await getLogChannel(guild, getConfig(guild.id, 'log_channel'));
  if (!logCh) return;

  const roles = member.roles.cache
    .filter((r) => r.id !== guild.id)
    .map((r) => r.toString())
    .join(', ') || 'None';

  await logCh.send({
    embeds: [logEntry({
      kind: 'member_remove',
      target: `${userTag(member.user)} (\`${member.user.id}\`)`,
      fields: [
        field('Joined', member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : 'Unknown'),
        field('Roles at departure', roles.slice(0, 1024), false),
      ],
      footer: 'Kratos System • Server log',
    })],
  }).catch(() => {});

  updateStatusChannels(guild, { fetchMembers: false }).catch(() => {});
}