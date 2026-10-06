import mongoose from 'mongoose';

/**
 * features — الحالة العامة لخصائص البوت، يكتبها المطوّر من لوحة التحكم
 * ويقرأها البوت ليفرضها. مجموعة واحدة مشتركة (`features`) بين اللوحتين،
 * ومفتاح كل خصيصة ثابت لا يتغيّر حتى تبقى اللوحتان متطابقتين.
 *
 * state:
 *   'on'          — الخصيصة تعمل طبيعياً
 *   'off'         — معطّلة تماماً: البوت يتجاهلها ولا يردّ عليها
 *   'maintenance' — قيد الصيانة: تردّ برسالة صيانة بدل التنفيذ
 */
const featureSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true, index: true },
  state:     { type: String, enum: ['on', 'off', 'maintenance'], default: 'on' },
  message:   { type: String, default: '' },
  updatedBy: { type: String, default: '' },
  updatedAt: { type: Number, default: Date.now },
});

export default mongoose.model('Feature', featureSchema);