import mongoose from 'mongoose';

/**
 * نفس مخطط اللوحة (مجموعة `maintenances` المشتركة). البوت يهمّه حقلان فقط:
 *
 *   botEnabled / botEndTime / botDurationMinutes / botMessage
 *       لتفعيل الصيانة على البوت، وأتمتة انتهائها، ورسالة الرفض.
 *   channelId / changelog
 *       قناة إشعار البدء/الانتهاء، وسجل التحديثات الذي يُعرض عند العودة.
 *
 * حقول الموقع (enabled/endTime/message) موجودة هنا أيضاً لأن المستند واحد،
 * لكن البوت لا يقرؤها.
 */
const maintenanceSchema = new mongoose.Schema({
  enabled:  { type: Boolean, default: false },
  endTime:  { type: Number, default: null },
  durationMinutes: { type: Number, default: 0 },
  message:  { type: String, default: 'الموقع تحت الصيانة حالياً. سنعود قريباً!' },

  botEnabled: { type: Boolean, default: false },
  botEndTime: { type: Number, default: null },
  botDurationMinutes: { type: Number, default: 0 },
  botMessage: { type: String, default: 'The bot is under maintenance and development. Please check back later.' },
  botStartedAt: { type: Number, default: null },

  channelId:{ type: String, default: '' },
  updatedAt:{ type: Number, default: Date.now },
  updatedBy:{ type: String, default: '' },
  changelog:{ type: Object, default: { botUpdates: '', siteUpdates: '' } },
});

export default mongoose.model('Maintenance', maintenanceSchema);