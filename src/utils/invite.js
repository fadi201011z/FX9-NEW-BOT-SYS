import { PermissionFlagsBits } from 'discord.js';

export async function getGuildInvite(guild) {
  try {
    const vanity = await guild.fetchVanityData();
    if (vanity?.code) return `https://discord.gg/${vanity.code}`;
  } catch {}

  try {
    const target = guild.systemChannel || guild.channels.cache.find(c =>
      c.type === 0 && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.CreateInstantInvite)
    );
    if (target) {
      const invite = await target.createInvite({ maxAge: 0, maxUses: 0 });
      return invite.url;
    }
  } catch {}

  return null;
}
