import { Events, AttachmentBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { logEntry, notice, field, userTag, C } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import { generateWelcomeCard } from '../utils/welcomeCard.js';

export const name = Events.GuildMemberAdd;
export const once = false;

const RAID_WINDOW_MS = 10_000;
const RAID_THRESHOLD = 10;
const RAID_ALERT_COOLDOWN_MS = 60_000;
const recentJoins    = new Map();
const lastRaidAlert  = new Map();

// Fallback only — the real value comes from the dashboard (`autorole_id`).
const FALLBACK_ROLE_ID = '1499393262476329020';

export async function execute(member) {
  const { guild } = member;
  const now = Date.now();

  // ─── Auto-role ───────────────────────────────────────────────────────────
  const autoRoleId = getConfig(guild.id, 'autorole_id') || FALLBACK_ROLE_ID;
  const role = guild.roles.cache.get(autoRoleId);
  if (role) {
    member.roles.add(role).catch(() => {
      console.log('[KRS-SYS] Could not grant the auto-role — check that the bot sits above it.');
    });
  }

  const welcomeChId = getConfig(guild.id, 'welcome_channel');
  const logChId     = getConfig(guild.id, 'log_channel');
  const modLogChId  = getConfig(guild.id, 'modlog_channel');

  // ─── Raid detection ──────────────────────────────────────────────────────
  const joins = (recentJoins.get(guild.id) ?? []).filter((t) => now - t < RAID_WINDOW_MS);
  joins.push(now);
  recentJoins.set(guild.id, joins);

  if (joins.length >= RAID_THRESHOLD) {
    const lastAlert = lastRaidAlert.get(guild.id) || 0;
    if (now - lastAlert >= RAID_ALERT_COOLDOWN_MS) {
      lastRaidAlert.set(guild.id, now);
      const alertCh = await getLogChannel(guild, modLogChId ?? logChId);
      if (alertCh) {
        await alertCh.send({
          embeds: [notice({
            title: '🚨 Raid — suspicious join wave',
            description: `**${joins.length}** members joined in under 10 seconds.\nConsider enabling verification or temporarily restricting access.`,
            color: C.error,
            fields: [
              field('Wave size', `${joins.length} joins / 10s`),
              field('Total members', `${guild.memberCount}`),
            ],
            footer: 'Kratos System • Raid alert',
            timestamp: true,
          })],
        }).catch(() => {});
      }
    }
  }

  const accountAgeDays = Math.floor((now - member.user.createdTimestamp) / 86_400_000);
  const isNewAccount   = accountAgeDays < 7;
  const avatarURL      = member.user.displayAvatarURL({ dynamic: true, size: 512 });

  // ─── Welcome card ────────────────────────────────────────────────────────
  // Rendered in the background so a slow canvas never delays the log below.
  if (welcomeChId) {
    const welcomeCh = await getLogChannel(guild, welcomeChId);
    // Confirm the cached channel is still the one the database points at.
    if (welcomeCh && welcomeCh.id === welcomeChId) {
      void (async () => {
        try {
          const card = await generateWelcomeCard(member, guild.id);
          await welcomeCh.send({
            content: `Welcome to **${guild.name}**, ${member}!`,
            files: [new AttachmentBuilder(card, { name: 'welcome.png' })],
          }).catch(() => {});
        } catch (err) {
          console.error('[WelcomeCard] Could not render the card:', err.message);
          await welcomeCh.send({
            embeds: [notice({
              title: `👋 Welcome to ${guild.name}`,
              description: `You are member **#${guild.memberCount}**.`,
              color: isNewAccount ? C.warn : C.ok,
              thumbnail: avatarURL,
              footer: 'Kratos System',
              timestamp: true,
            })],
          }).catch(() => {});
        }
      })();
    }
  }

  // ─── Join log ────────────────────────────────────────────────────────────
  if (logChId) {
    const logCh = await getLogChannel(guild, logChId);
    if (logCh && logCh.id === logChId) {
      const fields = [
        field('User ID', `\`${member.user.id}\``),
        field('Account age', `${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'}`),
        field('Member count', `${guild.memberCount}`),
      ];
      if (isNewAccount) fields.push(field('⚠️ Note', 'Account is less than 7 days old', false));

      await logCh.send({
        embeds: [logEntry({
          kind: 'member_join',
          target: `${userTag(member.user)} (\`${member.user.id}\`)`,
          fields,
          footer: 'Kratos System • Server log',
        })],
      }).catch(() => {});
    }
  }

  updateStatusChannels(guild, { fetchMembers: false }).catch(() => {});
}