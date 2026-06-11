import { errorEmbed, EPHEMERAL } from './embeds.js';
import { getConfig } from '../database.js';

/**
 * التحقق من صلاحية Discord التقليدية
 * (لا تزال تُستخدم داخلياً في بعض الأماكن)
 */
export async function requirePermission(interaction, permission) {
  if (!interaction.member.permissions.has(permission)) {
    await interaction.reply({
      embeds: [errorEmbed('صلاحيات غير كافية', 'ليس لديك الصلاحية الكافية لاستخدام هذا الأمر.')],
      flags: EPHEMERAL,
    });
    return false;
  }
  return true;
}

/**
 * التحقق من رتبة العضو حسب قائمة معرّفات الرتب المسموح بها
 *
 * - مالك السيرفر: مسموح تلقائياً
 * - أعضاء بصلاحية Administrator: مسموح تلقائياً
 * - باقي الأعضاء: يجب امتلاك رتبة من القائمة المحددة
 *
 * @param {Interaction} interaction
 * @param {string[]}    allowedRoles - قائمة معرّفات الرتب المسموح بها
 */
export async function requireRole(interaction, allowedRoles) {
  // مالك السيرفر → مسموح دائماً
  if (interaction.guild.ownerId === interaction.user.id) return true;

  // صلاحية Administrator في Discord → مسموح دائماً
  if (interaction.member.permissions.has(0x8n)) return true;

  // تحقق من الرتب المُعدَّة في config/roles.js
  const memberRoles = interaction.member.roles.cache;

  // إذا كانت القائمة فارغة أو تحتوي فقط على القيمة الافتراضية
  const validRoles = allowedRoles.filter(id => id && id !== 'ROLE_ID_HERE');

  if (validRoles.length === 0) {
    // لم تُعدَّ الرتب بعد → أبلغ المستخدم
    await interaction.reply({
      embeds: [
        errorEmbed(
          'الرتب غير مُعدَّة',
          'لم يتم تعيين رتب الصلاحيات بعد.\nيرجى تعديل ملف `config/roles.js` وإضافة معرّفات الرتب.'
        )
      ],
      flags: EPHEMERAL,
    });
    return false;
  }

  const hasRole = validRoles.some(roleId => memberRoles.has(roleId));

  if (!hasRole) {
    await interaction.reply({
      embeds: [errorEmbed('رتبة غير كافية', 'لا تملك الرتبة المطلوبة لاستخدام هذا الأمر.')],
      flags: EPHEMERAL,
    });
    return false;
  }

  return true;
}

/**
 * التحقق من إمكانية إجراء عملية إشراف على عضو (ترتيب الأدوار)
 */
export function canModerate(guild, target) {
  const botMember = guild.members.me;
  if (!botMember)  return false;
  if (target.id === guild.ownerId) return false;
  if (target.roles.highest.position >= botMember.roles.highest.position) return false;
  return true;
}

/**
 * جلب قناة بمعرّفها من السيرفر — يعيد null إذا لم تُوجد
 */
export async function getLogChannel(guild, channelId) {
  if (!channelId) return null;
  try { return await guild.channels.fetch(channelId); }
  catch { return null; }
}

/**
 * جلب القنوات الثلاث دفعة واحدة
 */
export async function getChannels(guild) {
  const [logCh, modLogCh, botLogCh] = await Promise.all([
    getLogChannel(guild, getConfig(guild.id, 'log_channel')),
    getLogChannel(guild, getConfig(guild.id, 'modlog_channel')),
    getLogChannel(guild, getConfig(guild.id, 'botlog_channel')),
  ]);
  return { logCh, modLogCh, botLogCh };
}
