/**
 * featureNotify.js — إشعار أصحاب السيرفرات وإدارييها عند تبديل حالة خصيصة.
 *
 * لماذا هذا الملف؟
 * ----------------
 * لائحة الخصائص عالمية: المطوّر يبدّلها من لوحة التحكم فتنعكس على كل سيرفر
 * يعمل فيه البوت. عندما تتغيّر حالة خصيصة يجب ألّا يكتشف أصحاب السيرفرات ذلك
 * متأخرين، فهذا الملف يُحوِّل التبديل إلى إشعار واضح:
 *
 *   1. رسالة خاصة (DM) إلى صاحب كل سيرفر، وإلى كل من أضافه كإداري في اللوحة،
 *      وإلى أي معرّف مذكور في إعداد `feature_notify_admins` (لاحقاً).
 *   2. إن تعذّر الوصول إلى صاحب السيرفر بالخاص (الخاص مغلق مثلاً)، يُنشر
 *      الإشعار في روم سجلات البوت (`botlog_channel`) مع منشن صاحب السيرفر،
 *      حتى لا يضيع الخبر.
 *
 * القواعد:
 *   - لا يرمي أبداً: كل سيرفر يُعالج على حدة، وسيرفرٌ تعذّر الوصول إليه لا
 *     يُسقط بقية الإشعارات.
 *   - لا يرسل عبر الخاص إلا وحدث تبديل فعلي (من features.loadFeatures).
 */

import mongoose from 'mongoose';
import { notice, field, C } from './embeds.js';
import { FEATURE_NAMES, STATE } from './features.js';
import { getConfig } from '../database.js';

const STATE_META = Object.freeze({
  [STATE.ON]:          { label: 'مفعّلة',      icon: '🟢', color: C.ok },
  [STATE.OFF]:         { label: 'معطّلة',      icon: '🔴', color: C.error },
  [STATE.MAINTENANCE]: { label: 'تحت الصيانة', icon: '🟠', color: C.warn },
});

const meta = (state) => STATE_META[state] || STATE_META[STATE.ON];

/** يبني بطاقة الإشعار الواحدة من بيانات التبديل + السيرفر الذي سيقرؤها. */
function buildEmbed(guild, change) {
  const to   = meta(change.to);
  const from = meta(change.from).label;
  const name = FEATURE_NAMES[change.key] || change.key;

  const fields = [
    field('🧩 الخصيصة',       `${to.icon} ${name}`, true),
    field('📌 الحالة الجديدة', to.label, true),
    field('↩️ الحالة السابقة', from, true),
    field('🌐 السيرفر',       `${guild.name}  ·  \`${guild.id}\``),
  ];
  if (change.message) fields.push(field('📝 ملاحظة المطوّر', change.message));

  return notice({
    title: `${to.icon} تحديث حالة خصيصة`,
    color: to.color,
    description: `تم وضع **${name}** في الحالة: **${to.label}**.`,
    fields,
    thumbnail: guild.iconURL?.({ dynamic: true, size: 128 }) || undefined,
    footer: 'Kratos System • لوحة التحكم',
    timestamp: true,
  });
}

/** الإداريون الذين أضافهم صاحب السيرفر عبر اللوحة (مجموعة `admins` المشتركة). */
async function dashboardAdmins(guildId) {
  try {
    const db = mongoose.connection?.db;
    if (!db) return [];
    const rows = await db.collection('admins').find({ guildId }).toArray();
    return rows.map((r) => r.userId).filter(Boolean);
  } catch {
    return [];
  }
}

/** قائمة إضافية من إعداد السيرفر، تحضيراً لواجهة «اختيار الإداريين» لاحقاً. */
function configuredAdmins(guildId) {
  const raw = getConfig(guildId, 'feature_notify_admins');
  if (!raw) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{15,25}$/.test(s));
}

/** كل من يجب إخباره في سيرفر واحد. صاحب السيرفر أولاً. */
async function recipientsFor(guild) {
  const ids = new Set();
  if (guild.ownerId) ids.add(guild.ownerId);
  for (const id of configuredAdmins(guild.id)) ids.add(id);
  for (const id of await dashboardAdmins(guild.id)) ids.add(id);
  return ids;
}

/**
 * يُرسل إشعار سيرفر واحد. يُعيد true إذا وصل الخاص إلى صاحب السيرفر، وfalse
 * إذا تعذّر (فنشرنا في سجلات البوت بدلاً منه).
 */
async function notifyGuild(client, guild, change) {
  const embed = buildEmbed(guild, change);
  const recipients = await recipientsFor(guild);

  let ownerReached = false;

  for (const userId of recipients) {
    try {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) continue;
      await user.send({ embeds: [embed] });
      if (userId === guild.ownerId) ownerReached = true;
    } catch { /* الخاص مغلق أو لا توجد قناة مشتركة */ }
  }

  // تعذّر الوصول إلى صاحب السيرفر؟ ننشره في سجلات البوت مع منشنه.
  if (!ownerReached) {
    try {
      const channelId = getConfig(guild.id, 'botlog_channel');
      if (channelId) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.send({
            content: guild.ownerId ? `<@${guild.ownerId}>` : undefined,
            embeds: [embed],
          }).catch(() => {});
        }
      }
    } catch { /* قناة السجل غير متاحة — لا شيء نفعله */ }
  }

  return ownerReached;
}

/**
 * نقطة الدخول: يستقبل التبديلات من loadFeatures ويرسلها لكل سيرفر.
 * آمن للاستدعاء قبل جاهزية العميل أو بدون تغييرات (يعود فوراً).
 */
export async function notifyFeatureChanges(client, changes) {
  if (!client?.isReady?.() || !Array.isArray(changes) || !changes.length) return;

  for (const change of changes) {
    for (const [, guild] of client.guilds.cache) {
      await notifyGuild(client, guild, change).catch(() => {});
    }
  }
}