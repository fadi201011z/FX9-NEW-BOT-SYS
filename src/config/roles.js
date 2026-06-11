/**
 * ═══════════════════════════════════════════════════════════════
 *   ملف إعداد الرتب المطور — Guardian & SYS BOT
 * ═══════════════════════════════════════════════════════════════
 */

export const ROLES = {
  DEVELOPER:  ['1499391819899998269'],
  ADMIN:      ['1499391995867697282'],
  SENIOR_MOD: ['1500142521651826889'],
  MODERATOR:  ['1499392077858078720'],
  SUPPORT:    ['1500142106990219335'],
  TRIAL:      ['1499392183193833493'],
};

export const COMMAND_ROLES = {
  // الفئة 1: أوامر النظام
  eval:       [...ROLES.DEVELOPER],
  database:   [...ROLES.DEVELOPER],
  reload:     [...ROLES.DEVELOPER],

  // الفئة 2: الإدارة العليا
  setup:      [...ROLES.DEVELOPER, ...ROLES.ADMIN],
  settings:   [...ROLES.DEVELOPER, ...ROLES.ADMIN],
  logs:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],
  
  // الفئة 3: التحكم بالسيرفر
  manage_roles:    [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],
  manage_channels: [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],
  unban:           [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD],

  // الفئة 4: العقوبات والإشراف
  ban:        [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  kick:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  timeout:    [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  warn:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  lock:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  unlock:     [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  hide:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  unhide:     [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],
  nick:       [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR],

  // الفئة 5: الدعم والصيانة
  clear:      [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR, ...ROLES.SUPPORT, ...ROLES.TRIAL],
  slowmode:   [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR, ...ROLES.SUPPORT, ...ROLES.TRIAL],
  ticket:     [...ROLES.DEVELOPER, ...ROLES.ADMIN, ...ROLES.SENIOR_MOD, ...ROLES.MODERATOR, ...ROLES.SUPPORT],
};

// ═══════════════════════════════════════════════════════════════
//  منطق التحكم المتقدم في صلاحيات القنوات
// ═══════════════════════════════════════════════════════════════

/**
 * 1. الرتب المسموح لها بالكتابة دائماً (حتى أثناء القفل)
 */
const ALLOWED_ADMINS = [
  ...ROLES.DEVELOPER,
  ...ROLES.ADMIN,
  ...ROLES.SENIOR_MOD,
  ...ROLES.MODERATOR
];

/**
 * 2. الرتب التي سيتم منعها صراحةً من الكتابة عند القفل
 */
const RESTRICTED_STAFF = [
  ...ROLES.SUPPORT,
  ...ROLES.TRIAL
];

/**
 * تطبيق نظام الصلاحيات عند قفل القناة
 */
export async function grantAdminAccess(channel, guild) {
  // أولاً: منح صلاحية الكتابة للإدارة العليا والمشرفين
  for (const roleId of ALLOWED_ADMINS) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await channel.permissionOverwrites.edit(role, { 
        SendMessages: true, 
        ViewChannel: true 
      }).catch(() => {});
    }
  }

  // ثانياً: منع رتب الدعم والمتدربين من الكتابة صراحةً
  for (const roleId of RESTRICTED_STAFF) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await channel.permissionOverwrites.edit(role, { 
        SendMessages: false 
      }).catch(() => {});
    }
  }
}

/**
 * إزالة كافة القيود (Overwrites) وإعادة القناة لوضعها الطبيعي
 */
export async function clearAdminOverwrites(channel, guild) {
  const allStaff = [...ALLOWED_ADMINS, ...RESTRICTED_STAFF];
  
  for (const roleId of allStaff) {
    const overwrite = channel.permissionOverwrites.cache.get(roleId);
    if (overwrite) {
      await overwrite.delete().catch(() => {});
    }
  }
}
