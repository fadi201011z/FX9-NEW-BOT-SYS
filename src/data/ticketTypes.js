export const CATEGORY_LABEL = {
  technical: "🛠️ دعم فني",
  complaint: "🚫 شكاوى",
  partnership: "🤝 شراكات",
  other: "❓ أخرى",
};

export const CATEGORY_SLUG = {
  technical: "دعم-فني",
  complaint: "شكاوى",
  partnership: "شراكات",
  other: "أخرى",
};

export const PRIORITY_LABEL = {
  high: "🔴 عالية",
  medium: "🟡 متوسطة",
  low: "🟢 منخفضة",
};

export const CATEGORY_EMOJI = {
  technical: "🛠️",
  complaint: "🚫",
  partnership: "🤝",
  other: "❓",
};

// ════════════════════════════════════════════════════════════════════════════
//  Per-category modal fields (professional form per ticket type)
// ════════════════════════════════════════════════════════════════════════════

export const CATEGORY_MODAL_FIELDS = {
  technical: [
    { id: 'title',            label: '📌 عنوان المشكلة',      placeholder: 'اكتب عنواناً مختصراً وواضحاً',         style: 'short',     required: true,  maxLength: 100 },
    { id: 'device',           label: '🖥️ الجهاز / المنصة',   placeholder: 'PC • Android • iPhone',                style: 'short',     required: true,  maxLength: 50 },
    { id: 'description',      label: '📝 وصف المشكلة',       placeholder: 'اشرح المشكلة بالتفصيل ومتى بدأت...',   style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'steps_tried',      label: '🧪 ما الذي جربته؟',    placeholder: 'أي خطوات قمت بها قبل فتح التذكرة؟',     style: 'paragraph', required: false, maxLength: 500 },
    { id: 'evidence',         label: '🔗 رابط الأدلة',       placeholder: 'لقطات شاشة أو فيديو (رابط)',            style: 'short',     required: false, maxLength: 500 },
  ],
  complaint: [
    { id: 'title',            label: '📌 عنوان البلاغ',      placeholder: 'مثال: إساءة من عضو',                    style: 'short',     required: true,  maxLength: 100 },
    { id: 'target',           label: '👤 العضو المبلَّغ عنه', placeholder: 'الاسم أو الـ ID',                      style: 'short',     required: true,  maxLength: 50 },
    { id: 'description',      label: '📝 تفاصيل الواقعة',    placeholder: 'اشرح ماذا حدث بالترتيب ومع التوقيت...', style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'evidence',         label: '🔗 رابط الأدلة',       placeholder: 'لقطات شاشة أو تسجيل (رابط)',            style: 'short',     required: false, maxLength: 500 },
  ],
  partnership: [
    { id: 'title',            label: '🤝 نوع الشراكة',       placeholder: 'إعلان • رعاية • تعاون',                 style: 'short',     required: true,  maxLength: 100 },
    { id: 'link',             label: '🔗 رابط السيرفر / قناتك', placeholder: 'https://discord.gg/...',             style: 'short',     required: true,  maxLength: 200 },
    { id: 'description',      label: '📝 تفاصيل عرضك',       placeholder: 'اشرح الجمهور، الدور، والشروط...',      style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'evidence',         label: '🔗 روابط إضافية',      placeholder: 'أي روابط تدعم عرضك',                    style: 'short',     required: false, maxLength: 500 },
  ],
  other: [
    { id: 'title',            label: '📌 عنوان الطلب',       placeholder: 'اكتب عنواناً مختصراً',                  style: 'short',     required: true,  maxLength: 100 },
    { id: 'description',      label: '📝 تفاصيل طلبك',       placeholder: 'اشرح ما تحتاجه بالتفصيل',               style: 'paragraph', required: true,  maxLength: 1000 },
    { id: 'evidence',         label: '🔗 رابط الأدلة',       placeholder: 'أي روابط مساعدة (اختياري)',             style: 'short',     required: false, maxLength: 500 },
  ],
};
