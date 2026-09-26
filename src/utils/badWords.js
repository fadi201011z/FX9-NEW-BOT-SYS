// ═══════════════════════════════════════════════════════════════════════════
//  FX9-SYS — فلتر الكلمات الممنوعة (Bad Words)
//
//  يكشف الكلمات حتى مع محاولات التهريب الشائعة:
//   • التشكيل والتطويل      (كَلْبٌ → كلب)
//   • تنويعات الحروف العربية (أ/إ/آ → ا ، ة → ه ، ى/ئ → ي ، ؤ → و ، ء تُحذف)
//   • الأحرف المتباعدة      (ا ل ح م ا ر → الحمار)
//   • الرموز بين الحروف     (ك$لمة ، ب$يت)
//   • الرموز اللاتينية      (b1tch → bitch ، f@ck → fuck ، $hit → shit)
// ═══════════════════════════════════════════════════════════════════════════

// ─── تنويعات الحروف العربية ───────────────────────────────────────────────
const AR_MAP = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ٵ': 'ا',
  'ة': 'ه',
  'ى': 'ي', 'ئ': 'ي',
  'ؤ': 'و',
  'ء': '',
};

// ─── استبدال الرموز الشائعة في الكتابة اللاتينية (Leet Speak) ─────────────
const LEET_MAP = {
  '0': 'o', '1': 'i', '2': 'z', '4': 'a', '5': 's', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '+': 't',
};

/**
 * تطبيع النص: حروف صغيرة + NFKC + إزالة التشكيل والتطويل + توحيد الحروف العربية.
 */
function normalizeCore(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    // تشكيل + تطويل
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // توحيد الحروف العربية
    .replace(/[أإآٱٲٳٵ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ء/g, '')
    // استبدال رموز الـ Leet اللاتينية
    .replace(/[012458@$!+]/g, c => LEET_MAP[c] ?? c);
}

/** النص بعد التطبيع مع إبقاء الحروف العربية فقط (لكشف التهريب بالفواصل). */
export function toArabicFlat(text) {
  return normalizeCore(text).replace(/[^\u0600-\u06FF]/g, '');
}

/** النص بعد التطبيع مع إبقاء الحروف والأرقام اللاتينية فقط. */
export function toLatinFlat(text) {
  return normalizeCore(text).replace(/[^a-z0-9]/g, '');
}

/** إزالة حروف العلة اللاتينية (للكشف عن Vowel-Leet مثل f@ck / fvck). */
function vowelReduced(s) {
  return s.replace(/[aeiou]/g, '');
}

/**
 * تطبيع قائمة الكلمات الممنوعة إلى كائنات موحّدة {word, enabled, punishment}.
 * يقبل القوائم القديمة (مصفوفة نصوص) والقوائم الجديدة (مصفوفة كائنات).
 */
export function normalizeBadWords(words) {
  if (!Array.isArray(words)) return [];
  const out = [];
  const seen = new Set();
  for (const e of words) {
    if (!e) continue;
    const word = typeof e === 'string' ? e.trim() : (typeof e?.word === 'string' ? e.word.trim() : '');
    if (!word || seen.has(word) || word.length < 1) continue;
    seen.add(word);
    const enabled    = typeof e === 'object' ? (e.enabled !== false) : true;
    const punishment = typeof e === 'object' && ['delete','timeout','warn','kick','ban'].includes(e.punishment)
      ? e.punishment : '';
    out.push({ word, enabled, punishment });
  }
  return out;
}

/**
 * البحث عن كلمة ممنوعة داخل النص.
 * @param {string} content النص الأصلي للرسالة
 * @param {Array<string|{word:string,enabled?:boolean,punishment?:string}>} words قائمة الكلمات الممنوعة
 * @returns {object|null} كائن الكلمة المُصادة {word, punishment} أو null
 */
export function findBadWord(content, words) {
  if (!content || !Array.isArray(words) || words.length === 0) return null;

  const entries = normalizeBadWords(words);
  if (entries.length === 0) return null;

  const arFlat  = toArabicFlat(content);
  const laFlat  = toLatinFlat(content);
  // هل استُخدمت رموز/أرقام لاتينية مقنّعة؟ (لا نطبّق فحص العلة إلا عندها لتفادي النتائج الخاطئة)
  const hasLeetMark = /[0-9@$!+]/.test(content);

  for (const entry of entries) {
    if (!entry || entry.enabled === false) continue;
    const w = entry.word;
    const first = w.trim().charAt(0);
    const isArabic = /[\u0600-\u06FF]/.test(first);

    const prepared = (isArabic ? toArabicFlat(w) : toLatinFlat(w));
    // طول 3 حروف فأكثر لتقليل النتائج الخاطئة للكلمات القصيرة جداً
    if (prepared.length < 3) continue;

    if (isArabic) {
      if (arFlat.includes(prepared)) return { word: w, punishment: entry.punishment };
    } else {
      if (laFlat.includes(prepared)) return { word: w, punishment: entry.punishment };
      // f@ck → fack: مطابقة بغض النظر عن حروف العلة (فقط عند وجود رموز مقنّعة)
      if (hasLeetMark) {
        const pV = vowelReduced(prepared);
        if (pV.length >= 3 && vowelReduced(laFlat).includes(pV)) return { word: w, punishment: entry.punishment };
      }
    }
  }
  return null;
}

/**
 * للتوافق مع الاستخدامات القديمة: تُرجع نص الكلمة المُصادة أو null.
 */
export function hasBadWord(content, words) {
  const hit = findBadWord(content, words);
  return hit ? hit.word : null;
}

/**
 * القائمة الافتراضية للكلمات الممنوعة — قابلة للتعديل الكامل من الداشبورد
 * (تُستخدم فقط عندما لا يضبط السيرفر قائمته الخاصة).
 */
export const DEFAULT_BAD_WORDS = [
  // ── عربية ──
  'احا', 'احيه', 'خره', 'خري', 'زباله', 'زبالة', 'قرف', 'عير', 'قضيب',
  'شرموطه', 'شرموطة', 'قحبه', 'قحبة', 'عرص', 'مقرف', 'غبي', 'غبيه',
  'حمار', 'حماره', 'كلب', 'كلبه', 'تيس', 'خنزير', 'عاهرة', 'عاهره',
  'قواد', 'لوطي', 'منيك', 'ناك', 'متناك', 'انيك', 'ابن الكلب',
  'ابن الكلبة', 'ابن العرص', 'كس امك', 'كس اختك', 'كس امها', 'امك',
  // ── إنجليزية ──
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick',
  'pussy', 'whore', 'slut', 'faggot', 'nigga', 'nigger', 'cock',
  'motherfucker', 'twat',
];