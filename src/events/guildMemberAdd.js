import { Events, AttachmentBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { logEntry, notice, field, userTag, C } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import { recordJoin } from '../utils/guildStats.js';
import { generateWelcomeCard } from '../utils/welcomeCard.js';
import { getDisplayMode, buildCustomEmbed } from '../utils/customDisplay.js';
import { isEnabled } from '../utils/features.js';
import { raidSettings, applyMemberAction, isExempt, PUNISH_LABEL } from '../utils/protection.js';

export const name = Events.GuildMemberAdd;
export const once = false;

const RAID_ALERT_COOLDOWN_MS = 60_000;
const recentJoins    = new Map();
const lastRaidAlert  = new Map();

// Fallback only — the real value comes from the dashboard (`autorole_id`).
const FALLBACK_ROLE_ID = '1499393262476329020';

/** "id,id,id" → ['id','id','id'], dropping anything that is not a snowflake. */
function parseRoleIds(raw) {
  return String(raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^\d{17,20}$/.test(id));
}

/**
 * Filters a wanted list down to the roles the bot can actually hand out:
 * existing, not @everyone, not integration-managed, and strictly below the
 * bot's own highest role (Discord refuses anything at or above it).
 */
function assignableRoles(guild, ids) {
  const ceiling = guild.members.me ? guild.members.me.roles.highest.position : 0;
  const out = [];
  for (const id of new Set(ids)) {
    const role = guild.roles.cache.get(id);
    if (!role || role.id === guild.id || role.managed) continue;
    if (role.position >= ceiling) continue;
    out.push(role);
  }
  return out;
}

export async function execute(member) {
  const { guild } = member;
  const now = Date.now();

  // ─── Auto-roles ──────────────────────────────────────────────────────────
  // Two lists come from the dashboard: one for people, one for bots. Bots only
  // ever take `autorole_bot`. People take `autorole_human`; when that key was
  // never written they fall back to the legacy single `autorole_id` and then
  // to the hard-coded fallback. An *empty* `autorole_human` is a decision, not
  // a missing value: the admin cleared the list, so nobody gets a role.
  const isBot = member.user.bot;
  const rawHuman = getConfig(guild.id, 'autorole_human');
  const rawBot = getConfig(guild.id, 'autorole_bot');

  let wanted;
  if (isBot) {
    wanted = parseRoleIds(rawBot);
  } else if (rawHuman !== null) {
    wanted = parseRoleIds(rawHuman);
  } else {
    const legacy = parseRoleIds(getConfig(guild.id, 'autorole_id'));
    wanted = legacy.length ? legacy : [FALLBACK_ROLE_ID];
  }

  const grantedRoles = assignableRoles(guild, wanted);
  if (grantedRoles.length) {
    await member.roles.add(grantedRoles, 'Auto-role on join').catch(() => {
      console.log('[KRS-SYS] Could not grant the auto-role — check that the bot sits above it.');
    });
  }

  const welcomeChId = getConfig(guild.id, 'welcome_channel');
  const logChId     = getConfig(guild.id, 'log_channel');
  const modLogChId  = getConfig(guild.id, 'modlog_channel');

  // ─── Anti-raid ───────────────────────────────────────────────────────────
  // Dashboard-controlled: `anti_raid` gate, `raid_limit` joins inside
  // `raid_window` ms, `raid_action` (alert / kick / ban), and an optional
  // `raid_min_account_age` gate that flags accounts younger than N days.
  if (isEnabled('protection')) {
    const settings = raidSettings(guild.id);
    if (settings.enabled) {
      const joins = (recentJoins.get(guild.id) ?? []).filter((t) => now - t < settings.windowMs);
      joins.push(now);
      recentJoins.set(guild.id, joins);

      const accountAgeDays = Math.floor((now - member.user.createdTimestamp) / 86_400_000);
      const tooNew = settings.minAgeDays > 0 && accountAgeDays < settings.minAgeDays;
      const wave   = joins.length >= settings.limit;

      if (wave || tooNew) {
        let done = 'none';
        const exempt = isExempt(guild.id, member, null);
        if (settings.action !== 'alert' && !exempt) {
          done = await applyMemberAction(member, settings.action, 'Anti-raid: suspicious join', 3_600_000);
        }

        const lastAlert = lastRaidAlert.get(guild.id) || 0;
        if (now - lastAlert >= RAID_ALERT_COOLDOWN_MS) {
          lastRaidAlert.set(guild.id, now);
          const alertCh = await getLogChannel(guild, modLogChId ?? logChId);
          if (alertCh) {
            await alertCh.send({
              embeds: [notice({
                title: '🚨 Anti-raid — suspicious join wave',
                description: `**${joins.length}** members joined in under ${Math.round(settings.windowMs / 1000)} seconds.`
                  + (settings.action !== 'alert'
                    ? `\nThe joining member was handled automatically.`
                    : '\nConsider enabling verification or temporarily restricting access.'),
                color: C.error,
                fields: [
                  field('Wave size', `${joins.length} / ${Math.round(settings.windowMs / 1000)}s (limit ${settings.limit})`),
                  field('Account age', `${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'}`),
                  field('Total members', `${guild.memberCount}`),
                  field('Action', settings.action === 'alert'
                    ? 'Alert only'
                    : exempt ? 'Skipped (whitelisted)' : (PUNISH_LABEL[done] ?? done)),
                ],
                footer: 'Kratos System • Raid alert',
                timestamp: true,
              })],
            }).catch(() => {});
          }
        }
      }
    }
  }

  const accountAgeDays = Math.floor((now - member.user.createdTimestamp) / 86_400_000);
  const isNewAccount   = accountAgeDays < 7;
  const avatarURL      = member.user.displayAvatarURL({ dynamic: true, size: 512 });

  // ─── Welcome card ────────────────────────────────────────────────────────
  // Rendered in the background so a slow canvas never delays the log below.
  if (welcomeChId && isEnabled('welcome')) {
    const welcomeCh = await getLogChannel(guild, welcomeChId);
    // Confirm the cached channel is still the one the database points at.
    if (welcomeCh && welcomeCh.id === welcomeChId) {
      void (async () => {
        // Embed mode replaces the rendered card with the admin-built embed.
        // An empty/invalid embed falls through to the card so a member never
        // joins without a welcome.
        if (getDisplayMode(guild.id, 'welcome') === 'embed') {
          const custom = buildCustomEmbed(guild.id, 'welcome', {
            user: member.user.username,
            tag: member.user.tag,
            mention: `<@${member.id}>`,
            server: guild.name,
            count: guild.memberCount,
          });
          if (custom) {
            await welcomeCh.send({ embeds: [custom] }).catch(() => {});
            return;
          }
        }
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
  if (logChId && isEnabled('logging')) {
    const logCh = await getLogChannel(guild, logChId);
    if (logCh && logCh.id === logChId) {
      const fields = [
        field('User ID', `\`${member.user.id}\``),
        field('Account age', `${accountAgeDays} day${accountAgeDays === 1 ? '' : 's'}`),
        field('Member count', `${guild.memberCount}`),
      ];
      if (grantedRoles.length) fields.push(field('Auto-role', grantedRoles.map((r) => `<@&${r.id}>`).join(', ')));
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

  // Counted before anything optional runs: a join that finds no welcome
  // channel, no log channel or a broken embed still happened today.
  recordJoin(guild.id, guild.memberCount);

  updateStatusChannels(guild, { fetchMembers: false }).catch(() => {});
}