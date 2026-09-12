import { Events, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getConfig } from '../database.js';
import { getLogChannel } from '../utils/permissions.js';
import { Colors, alertEmbed, userTag } from '../utils/embeds.js';
import { updateStatusChannels } from '../utils/statusUpdater.js';
import { generateWelcomeCard } from '../utils/welcomeCard.js';

export const name = Events.GuildMemberAdd;
export const once = false;

const RAID_WINDOW_MS = 10_000;
const RAID_THRESHOLD = 10;
const RAID_ALERT_COOLDOWN_MS = 60_000;
const recentJoins    = new Map();
const lastRaidAlert  = new Map();

// أيدي الرتبة التي سيتم منحها تلقائياً (يمكن تغييرها من الداشبورد عبر autorole_id)
const FALLBACK_ROLE_ID = '1499393262476329020';

export async function execute(member) {
  const { guild } = member;
  const now = Date.now();

  // ─── منح الرتبة تلقائياً فور الدخول ─────────────────────────────────────
  const autoRoleId = getConfig(guild.id, 'autorole_id') || FALLBACK_ROLE_ID;
  const role = guild.roles.cache.get(autoRoleId);
  if (role) {
    member.roles.add(role).catch(() => {
      console.log(`[FX9-SYS] فشل إضافة الرتبة - تأكد أن رتبة البوت أعلى من الرتبة المراد منحها.`);
    });
  }

  // ─── جلب الإعدادات من قاعدة البيانات ────────────────────────────────────
  const welcomeChId = getConfig(guild.id, 'welcome_channel');
  const logChId     = getConfig(guild.id, 'log_channel');
  const modLogChId  = getConfig(guild.id, 'modlog_channel');

  // ─── كشف الـ Raid ────────────────────────────────────────────────────────
  const joins = (recentJoins.get(guild.id) ?? []).filter(t => now - t < RAID_WINDOW_MS);
  joins.push(now);
  recentJoins.set(guild.id, joins);

  if (joins.length >= RAID_THRESHOLD) {
    const lastAlert = lastRaidAlert.get(guild.id) || 0;
    if (now - lastAlert >= RAID_ALERT_COOLDOWN_MS) {
      lastRaidAlert.set(guild.id, now);
      const alertCh = await getLogChannel(guild, modLogChId ?? logChId);
      if (alertCh) {
        await alertCh.send({
          embeds: [
            alertEmbed('Raid — موجة انضمام مشبوهة!')
              .setDescription(
                `انضم **${joins.length} عضو** في أقل من 10 ثوانٍ!\n` +
                'يُنصح بتفعيل التحقق أو تقييد الدخول مؤقتاً.'
              )
              .addFields(
                { name: '📊 الموجة',     value: `${joins.length} / 10ث`, inline: true },
                { name: '👥 الإجمالي',    value: `${guild.memberCount}`,   inline: true },
              )
          ],
        }).catch(() => {});
      }
    }
  }

  const accountAgeDays = Math.floor((now - member.user.createdTimestamp) / 86_400_000);
  const isNewAccount   = accountAgeDays < 7;
  const avatarURL      = member.user.displayAvatarURL({ dynamic: true, size: 512 });

  // ─── بطاقة الترحيب (تُنشأ في الخلفية حتى لا تُبطئ بقية السجلات) ──────────
  if (welcomeChId) {
    const welcomeCh = await getLogChannel(guild, welcomeChId);
    // التأكد أن القناة الموجودة في الكاش هي نفسها المطلوبة حالياً في الداتا بيز
    if (welcomeCh && welcomeCh.id === welcomeChId) {
      const text = `✦ — Welcome ${member} To FAdiX9 Surver . ✨`;
      void (async () => {
        try {
          const card = await generateWelcomeCard(member);
          const attachment = new AttachmentBuilder(card, { name: 'welcome.png' });
          await welcomeCh.send({ content: text, files: [attachment] }).catch(() => {});
        } catch (err) {
          console.error('[WelcomeCard] فشل إنشاء البطاقة:', err.message);
          const fallback = new EmbedBuilder()
            .setColor(isNewAccount ? Colors.CRIMSON : Colors.WHITE)
            .setDescription(`## 👋 أهلاً بك ${member}\n` + `مرحباً في **${guild.name}**!\n` + `أنت العضو رقم **#${guild.memberCount}**`)
            .setThumbnail(avatarURL)
            .setTimestamp()
            .setFooter({ text: `⚔️ FX9-SYS  •  ${guild.name}` });
          await welcomeCh.send({ embeds: [fallback] }).catch(() => {});
        }
      })();
    }
  }

  // ─── سجل الانضمام (قناة السجلات العامة) ─────────────────────────────────
  if (logChId) {
    const logCh = await getLogChannel(guild, logChId);
    if (logCh && logCh.id === logChId) {
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(isNewAccount ? Colors.CRIMSON : Colors.JOIN)
            .setTitle('📥  انضمام عضو')
            .addFields(
              { name: '👤 العضو',      value: `${member} — \`${userTag(member.user)}\``, inline: false },
              { name: '🆔 المعرّف',    value: `\`${member.user.id}\``,               inline: true  },
              { name: '🕐 عمر الحساب', value: `${accountAgeDays} يوم`,              inline: true  },
              { name: '👥 الأعضاء',    value: `${guild.memberCount}`,               inline: true  },
              ...(isNewAccount ? [{ name: '⚠️ تنبيه', value: 'حساب عمره أقل من 7 أيام', inline: false }] : []),
            )
            .setThumbnail(avatarURL)
            .setTimestamp()
            .setFooter({ text: '⚔️ FX9-SYS  •  السجلات العامة' })
        ],
      }).catch(() => {});
    }
  }

  updateStatusChannels(guild, { fetchMembers: false }).catch(() => {});
}
