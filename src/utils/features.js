/**
 * features.js — سجلّ خصائص البوت العالمي (التحكم من لوحة التحكم).
 *
 * لماذا هذا الملف؟
 * ----------------
 * الداشبورد هو "طائرة التحكم": المطور يبدّل حالة كل خصيصة (تشغيل / تعطيل /
 * صيانة) فتُحفظ في مجموعة `features` ثم تُرسَل إلى البوت عبر
 *   POST /api/features/sync
 * البوت هنا يقرأها دورياً (كل 5 ثوان) في الذاكرة، فتكون كل الفحوصات فورية
 * بلا استعلام قاعدة بيانات في كل رسالة أو تفاعل.
 *
 * القاعدة الذهبية: أي مفتاح غير مخزَّن = مفعّل (on). هكذا لا تتعطّل خصيصة
 * بالخطأ إذا أضفنا ميزة جديدة قبل أن تُزرع في قاعدة البيانات.
 */

import Feature from '../models/Feature.js';
import { commandModules } from '../config/commandLoader.js';

export const STATE = Object.freeze({ ON: 'on', OFF: 'off', MAINTENANCE: 'maintenance' });

/** الأسماء العربية — تُستخدم في ردود البوت على المستخدمين. */
export const FEATURE_NAMES = Object.freeze({
  tickets:       'نظام التذاكر',
  temp_voice:    'الرومات الصوتية المؤقتة',
  notifications: 'الإشعارات',
  welcome:       'الترحيب والأعضاء',
  logging:       'سجلات السيرفر',
  protection:    'الحماية والمكافحة',
  moderation:    'أوامر الإدارة',
  setup:         'إعداد السيرفر',
  info:          'الأوامر العامة',
  announcements: 'الإعلانات',
});

/** مجلد الأوامر → مفتاح الخصيصة. */
export const FEATURE_BY_FOLDER = Object.freeze({
  ticket:        'tickets',
  voice:         'temp_voice',
  notifications: 'notifications',
  moderation:    'moderation',
  setup:         'setup',
  info:          'info',
  members:       'info',
  announcement:  'announcements',
});

/** الحدث → الخصيصة التي يخدمها (للمغلّف المركزي في index.js). */
export const FEATURE_BY_EVENT = Object.freeze({
  guildMemberAdd:    'welcome',
  messageDelete:     'logging',
  messageUpdate:     'logging',
  messageBulkDelete: 'logging',
  channelCreate:     'logging',
  channelDelete:     'logging',
  channelUpdate:     'logging',
  roleCreate:        'logging',
  roleDelete:        'logging',
  roleUpdate:        'logging',
  guildBanAdd:       'logging',
  guildBanRemove:    'logging',
  guildMemberRemove: 'logging',
  guildMemberUpdate: 'logging',
});

// ── Cache ──────────────────────────────────────────────────────────────────
let cache = new Map();
let loadedAt = 0;

/**
 * يقرأ الحالات من قاعدة البيانات إلى الذاكرة. يُستدعى كل 5 ثوان وعند كل مزامنة.
 *
 * يُعيد قائمة الخصائص التي تغيّرت حالتها فعلاً منذ آخر قراءة:
 *   [{ key, from, to, message }]
 * الحمل الأول يكون فيه المخزون فارغاً، فلا يُبلَّغ عن شيء عند إقلاع البوت،
 * وإعادة قراءة لا تغيّر شيئاً تُعيد قائمة فارغة. هذا ما يجعل الإشعار يُرسل
 * مرة واحدة فقط لكل تبديل، سواء جاء من دفعة اللوحة أو من القراءة الدورية.
 */
export async function loadFeatures() {
  try {
    const docs = await Feature.find({}).lean();
    const next = new Map();
    for (const d of docs) {
      if (!d?.key) continue;
      const state = Object.values(STATE).includes(d.state) ? d.state : STATE.ON;
      next.set(d.key, { state, message: d.message || '' });
    }

    const changes = [];
    for (const [key, value] of next) {
      const before = cache.get(key);
      if (before && before.state !== value.state) {
        changes.push({ key, from: before.state, to: value.state, message: value.message });
      }
    }

    cache = next;
    loadedAt = Date.now();
    return changes;
  } catch (err) {
    // قاعدة البيانات غير متاحة؟ نُبقي آخر لقطة في الذاكرة بدل تعطيل كل شيء.
    if (!loadedAt) console.warn('[Features] load failed:', err.message);
    return [];
  }
}

/** حالة خصيصة: { state, message }. الافتراضي مفعّلة. */
export function getFeature(key) {
  return cache.get(key) || { state: STATE.ON, message: '' };
}

/** هل الخصيصة مفعّلة تماماً؟ (الوضع الافتراضي عند الجهل = نعم) */
export function isEnabled(key) {
  return getFeature(key).state === STATE.ON;
}

let folderByName = null;

/** يبحث عن مفتاح الخصيصة الموافق لاسم أمر سلاش. */
export async function featureForCommand(commandName) {
  if (!folderByName) {
    folderByName = new Map();
    try {
      for (const c of await commandModules()) folderByName.set(c.name, c.folder);
    } catch {}
  }
  const folder = folderByName.get(commandName);
  return folder ? FEATURE_BY_FOLDER[folder] || null : null;
}

/** يبحث عن مفتاح الخصيصة الموافق لمُعرّف عنصر تفاعلي (زر/قائمة/نموذج). */
export function featureForComponent(customId) {
  if (!customId) return null;
  if (customId.startsWith('ticket') || customId.startsWith('rate_')) return 'tickets';
  if (customId.startsWith('vc_') || customId.startsWith('modal_vc_')) return 'temp_voice';
  if (customId === 'help_menu') return 'info';
  return null;
}

/** خصائص الأحداث: اسم الحدث → مفتاح الخصيصة (أو null). */
export function featureForEvent(eventName) {
  return FEATURE_BY_EVENT[eventName] || null;
}