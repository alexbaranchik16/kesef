// Parsing of card SMS / notifications, statement files, and merchant → category rules.
const Parser = (() => {
  const CUR = { 'ש"ח': 'ILS', 'שח': 'ILS', '₪': 'ILS', 'ILS': 'ILS', 'NIS': 'ILS', '$': 'USD', 'USD': 'USD', 'דולר': 'USD',
                '€': 'EUR', 'EUR': 'EUR', 'יורו': 'EUR', '£': 'GBP', 'GBP': 'GBP' };
  const CUR_RE = '(ש"ח|שח|₪|ILS|NIS|\\$|USD|דולר|€|EUR|יורו|£|GBP)';
  const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const toNum = s => parseFloat(String(s).replace(/,/g, ''));

  function norm(s) {
    return String(s || '')
      .replace(/[״”“]/g, '"').replace(/[׳’‘]/g, "'")
      .replace(/[‎‏‪-‮]/g, '')
      .replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  }

  function detectIssuer(t) {
    if (/כאל|\bCAL\b|cal-online/i.test(t)) return 'כאל';
    if (/אמריקן|אמקס|AMEX|American Express/i.test(t)) return 'אמקס';
    if (/ישראכרט|isracard/i.test(t)) return 'ישראכרט';
    if (/\bMAX\b|מקס|לאומי קארד/i.test(t)) return 'מקס';
    if (/דיינרס|diners/i.test(t)) return 'דיינרס';
    return '';
  }

  function findAmount(t) {
    let m;
    const kw = new RegExp('(?:בסך|בסכום|סכום(?:\\s+העסקה|\\s+החיוב|\\s+עסקה|\\s+חיוב)?|על\\s+סך|סך|סה"כ)\\s*(?:של\\s*)?:?\\s*' + CUR_RE + '?\\s*' + NUM + '\\s*' + CUR_RE + '?');
    if ((m = t.match(kw))) return { amount: toNum(m[2]), currency: CUR[m[1] || m[3]] || 'ILS', index: m.index, end: m.index + m[0].length };
    if ((m = t.match(new RegExp(NUM + '\\s*' + CUR_RE)))) return { amount: toNum(m[1]), currency: CUR[m[2]], index: m.index, end: m.index + m[0].length };
    if ((m = t.match(new RegExp(CUR_RE + '\\s*' + NUM)))) return { amount: toNum(m[2]), currency: CUR[m[1]], index: m.index, end: m.index + m[0].length };
    return null;
  }

  function findDate(t, now = new Date()) {
    const m = t.match(/(?:^|[^\d.\/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d\/])/) ||
              t.match(/(?:^|[^\d.])(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?![\d.])/);
    if (!m) return null;
    const d = +m[1], mo = +m[2];
    let y = m[3] ? +m[3] : null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (y !== null && y < 100) y += 2000;
    if (y === null) { y = now.getFullYear(); if (mo > now.getMonth() + 2) y--; }   // December purchase seen in January
    return iso(y, mo, d);
  }

  function findCard(t) {
    const m = t.match(/(?:המסתיים|המסתיימת|מסתיים|שמספרו|שסיומו|בסיומת|סיומת|ספרות)\s*(?:ב-?|ב|:)?\s*(\d{4})(?![\d\/.])/) ||
              t.match(/כרטיס\S*\s*(?:[^\d\s]\S*\s*){0,3}?(\d{4})(?![\d\/.])/);
    return m ? m[1] : '';
  }

  const STOP = /\s*(?:\.\s|\.$|,|;|\n|!|\(|בתאריך|ביום|בסך|בסכום|על סך|לפרטים|למידע|לבירורים|בכרטיס|אושר|בוצע|במסגרת|בשעה|https?:|www\.)/;
  function cleanMerchant(s) {
    s = (s || '').split(STOP)[0];
    s = s.replace(/^[\s\-:"']+|[\s\-:"'.]+$/g, '').replace(/\s+/g, ' ').slice(0, 40);
    if (/^(תאריך|כרטיס|יום|שעה|סך|סכום)/.test(s) || /^\d/.test(s)) return '';
    return s;
  }
  function findMerchant(t, amt) {
    let m = t.match(/(?:[בומ]בית\s+ה?עסק|בעסק|אצל|עבור|במסוף)\s*:?\s*["']?([^\n]+)/);
    if (m) { const c = cleanMerchant(m[1]); if (c) return c; }
    if (amt) {
      const after = t.slice(amt.end);
      m = after.match(/^\s*(?:ש"ח|₪)?\s*(?:ב-\s*|ב\s+|ב(?=[^\d\s]))([^\n]+)/);
      if (m) { const c = cleanMerchant(m[1]); if (c) return c; }
      const before = t.slice(0, amt.index);
      m = before.match(/(?:עסקה|רכישה|חיוב|תשלום)\s+(?:ב-|ב)\s*([^\d\n][^\n]*?)\s*$/);
      if (m) { const c = cleanMerchant(m[1]); if (c) return c; }
    }
    m = t.match(/(?:^|\s)ב-\s*([^\d\s][^\n]*)/);
    if (m) { const c = cleanMerchant(m[1]); if (c) return c; }
    return '';
  }

  // One message → { ok, amount, currency, merchant, card, issuer, date, type, note, raw }
  function parseSms(raw, now = new Date()) {
    const t = norm(raw);
    if (!t) return { ok: false, reason: 'הודעה ריקה', raw };
    if (/נדחתה|סורבה|לא אושרה|נחסמה/.test(t)) return { ok: false, skip: true, reason: 'עסקה שנדחתה', raw };
    const amt = findAmount(t);
    if (!amt || !(amt.amount > 0)) return { ok: false, reason: 'לא נמצא סכום', raw };
    const issuer = detectIssuer(t);
    const card = findCard(t);
    const notes = [];
    let type = 'expense';
    if (/זיכוי|זוכה|החזר כספי|הועבר לזכות|לזכותך/.test(t)) { type = 'income'; notes.push('זיכוי'); }
    if (/בוטלה|ביטול עסקה|בוטל/.test(t)) { type = 'income'; notes.push('ביטול עסקה'); }
    let m;
    if ((m = t.match(/תשלום\s*(\d+)\s*(?:מתוך|מ-)\s*(\d+)/))) notes.push(`תשלום ${m[1]}/${m[2]}`);
    else if ((m = t.match(/(\d+)\s*תשלומים/))) notes.push(`${m[1]} תשלומים`);
    if (amt.currency !== 'ILS') notes.push(`מט"ח: ${amt.amount} ${amt.currency} — לעדכן לסכום בשקלים`);
    return {
      ok: true, amount: amt.amount, currency: amt.currency, merchant: findMerchant(t, amt),
      card, issuer, date: findDate(t, now) || iso(now.getFullYear(), now.getMonth() + 1, now.getDate()),
      type, note: notes.join(' · '), raw: t,
    };
  }

  // Pasted text may hold many messages: split on blank lines, or per line when every line is a full message
  function splitMessages(text) {
    const t = String(text || '').replace(/\r/g, '');
    const out = [];
    for (const block of t.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean)) {
      const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every(l => findAmount(norm(l)))) out.push(...lines);
      else out.push(block);
    }
    return out;
  }

  function hash(s) {
    s = norm(s);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36) + s.length;
  }

  // ───────── Statement files (CAL / Isracard-AMEX / Max exports) ─────────
  function parseAnyDate(v) {
    if (v instanceof Date && !isNaN(v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; if (+m[2] >= 1 && +m[2] <= 12) return iso(y, +m[2], +m[1]); }
    return null;
  }
  function parseAmount(v) {
    if (typeof v === 'number') return v;
    let s = String(v || '').replace(/[₪\s]|ש"ח|ILS|NIS/g, '');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/^-/.test(s)) { neg = true; s = s.slice(1); }
    s = s.replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return neg ? -parseFloat(s) : parseFloat(s);
  }
  function detectHeader(cells) {
    const idx = re => cells.findIndex(c => typeof c === 'string' && re.test(c));
    let date = idx(/תאריך\s*(ה)?(עסקה|רכישה)/); if (date < 0) date = idx(/^תאריך/);
    const merchant = idx(/בית\s*ה?עסק|שם\s*העסק|^תיאור|^פירוט$/);
    let amount = idx(/סכום\s*(ה)?חיוב/); if (amount < 0) amount = idx(/סכום/);
    if (date < 0 || merchant < 0 || amount < 0) return null;
    const sector = idx(/ענף|קטגוריה/), note = idx(/הערות|פירוט נוסף/);
    return { date, merchant, amount, sector: sector < 0 ? null : sector, note: note < 0 || note === merchant ? null : note };
  }
  function parseTable(rows) {
    const out = [];
    let map = null;
    for (const r of rows) {
      const cells = r.map(c => (c instanceof Date || typeof c === 'number') ? c : String(c ?? '').trim());
      const h = detectHeader(cells);
      if (h) { map = h; continue; }
      if (!map) continue;
      const date = parseAnyDate(cells[map.date]);
      const amount = parseAmount(cells[map.amount]);
      const merchant = String(cells[map.merchant] ?? '').trim();
      if (!date || amount == null || amount === 0 || !merchant || /סה"כ|סך הכל|סה״כ/.test(merchant)) continue;
      out.push({
        date, amount: Math.abs(amount), type: amount < 0 ? 'income' : 'expense', merchant,
        sector: map.sector != null ? String(cells[map.sector] ?? '') : '',
        note: map.note != null ? String(cells[map.note] ?? '') : '',
      });
    }
    return out;
  }

  // ───────── Categorisation ─────────
  // Order matters: more specific groups first (e.g. "סופר-פארם" before "סופר").
  const BUILTIN = [
    ['bills', ['רמי לוי תקשורת', 'חברת החשמל', 'חברת חשמל', 'חשמל לישראל', 'פזגז', 'סופרגז', 'אמישראגז', 'תאגיד', 'מי אביבים', 'מי שבע', 'הגיחון', 'עירית', 'עיריית', 'ארנונה', 'בזק', 'פרטנר', 'partner', 'סלקום', 'cellcom', 'הוט', 'hot', 'yes', 'גולן טלקום', 'פלאפון', 'pelephone', 'ביטוח לאומי', 'הראל', 'מגדל', 'כלל ביטוח', 'הפניקס', 'מנורה', 'ביטוח', 'תקשורת', 'ממשלה ועיריות']],
    ['health', ['סופר-פארם', 'סופר פארם', 'superpharm', 'super-pharm', 'be פארם', 'גוד פארם', 'ניו פארם', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'בית מרקחת', 'פארם', 'רופא', 'מרפאה', 'אופטיק', 'שיניים', 'רפואה', 'בריאות']],
    ['subs', ['netflix', 'נטפליקס', 'spotify', 'ספוטיפיי', 'apple.com', 'itunes', 'icloud', 'google', 'youtube', 'disney', 'prime video', 'chatgpt', 'openai', 'anthropic', 'claude.ai', 'microsoft', 'adobe', 'dropbox', 'הולמס פלייס', 'holmes place', 'גו אקטיב', 'go active', 'ספייס', 'חדר כושר', 'פיטנס', 'fitness']],
    ['eat', ['ארומה', 'aroma', 'קפה קפה', 'גרג', 'לנדוור', 'מקדונלד', 'mcdonald', 'בורגר', 'burger', 'פיצה', 'pizza', 'דומינו', 'וולט', 'wolt', 'תן ביס', '10bis', 'סושי', 'שווארמה', 'פלאפל', 'מסעדה', 'מסעדת', 'מסעדות', 'קפה', 'cafe', 'coffee', 'ביסטרו', 'פאב', 'ג\'פניקה', 'japanika', 'מוזס', 'אגאדיר', 'רולדין', 'מזון מהיר', 'בייקרי', 'bakery']],
    ['transport', ['פז', 'paz', 'דלק', 'delek', 'סונול', 'sonol', 'דור אלון', 'אלון', 'ten', 'טן', 'yellow', 'רב קו', 'רב-קו', 'rav kav', 'gett', 'גט טקסי', 'yango', 'יאנגו', 'מונית', 'חניה', 'חניון', 'פנגו', 'pango', 'סלופארק', 'cellopark', 'כביש 6', 'נתיבי', 'רכבת', 'אגד', 'מטרופולין', 'uber', 'מוסך', 'צמיגים', 'רכב', 'תחבורה']],
    ['clothes', ['זארה', 'zara', 'h&m', 'קסטרו', 'castro', 'פוקס', 'fox', 'גולף', 'golf', 'רנואר', 'renuar', 'טרמינל', 'terminal x', 'אמריקן איגל', 'נייקי', 'nike', 'אדידס', 'adidas', 'מנגו', 'mango', 'הודיס', 'נעלי', 'ביגוד', 'הלבשה', 'אופנה']],
    ['shopping', ['אמזון', 'amazon', 'עלי אקספרס', 'aliexpress', 'ebay', 'איביי', 'shein', 'שיין', 'temu', 'טמו', 'איקאה', 'ikea', 'אייס', 'ace', 'הום סנטר', 'ksp', 'באג', 'bug', 'אייבורי', 'ivory', 'מחסני חשמל', 'שקם אלקטריק', 'מקס סטוק', 'max stock', 'ריהוט', 'כלי בית', 'אלקטרוניקה']],
    ['fun', ['סינמה', 'cinema', 'יס פלאנט', 'קולנוע', 'הופעה', 'eventim', 'לאן', 'תיאטרון', 'מוזיאון', 'ספא', 'באולינג', 'booking', 'airbnb', 'אל על', 'el al', 'ישראייר', 'ארקיע', 'wizz', 'ryanair', 'מלון', 'hotel', 'פנאי', 'תיירות', 'בילוי']],
    ['edu', ['אוניברסיט', 'מכללה', 'קורס', 'udemy', 'coursera', 'סטימצקי', 'צומת ספרים', 'ספרים', 'חינוך']],
    ['gifts', ['מתנה', 'מתנות', 'gift', 'פרחים', 'flowers']],
    ['home', ['שכר דירה', 'ועד בית', 'משכנתא', 'שיפוצים', 'אינסטלטור', 'חשמלאי']],
    ['food', ['שופרסל', 'shufersal', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'אושר עד', 'טיב טעם', 'מגה', 'חצי חינם', 'יינות ביתן', 'קרפור', 'carrefour', 'am:pm', 'am pm', 'סופר', 'מכולת', 'פרש מרקט', 'קשת טעמים', 'מחסני השוק', 'סטופ מרקט', 'ירקות', 'מאפיית', 'מאפייה', 'קצביית', 'נספרסו', 'nespresso', 'מזון', 'מרכול']],
  ];
  const LETTER = /[A-Za-z0-9֐-׿]/;
  function hasWord(text, kw) {
    let i = text.indexOf(kw);
    while (i >= 0) {
      const before = i === 0 ? '' : text[i - 1], after = text[i + kw.length] || '';
      if (!LETTER.test(before) && !LETTER.test(after)) return true;
      i = text.indexOf(kw, i + 1);
    }
    return false;
  }
  function categorize(text, userRules = []) {
    const t = norm(text).toLowerCase();
    if (!t) return null;
    for (const r of userRules) if (r.k && t.includes(r.k.toLowerCase())) return r.cat;
    for (const [cat, kws] of BUILTIN) for (const k of kws) if (hasWord(t, k.toLowerCase())) return cat;
    return null;
  }

  return { parseSms, splitMessages, hash, parseTable, parseAnyDate, categorize, norm, detectIssuer };
})();
