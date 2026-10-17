(() => {
'use strict';
// ═════════════════════════ Storage ═════════════════════════
const KEY = 'kesef.v1';
const DEFAULT_CATS = [
  { id: 'food', name: 'סופר ומזון', icon: '🛒', type: 'expense', color: '#16a34a' },
  { id: 'eat', name: 'מסעדות וקפה', icon: '🍽️', type: 'expense', color: '#ea580c' },
  { id: 'transport', name: 'תחבורה ודלק', icon: '⛽', type: 'expense', color: '#2563eb' },
  { id: 'home', name: 'דיור', icon: '🏠', type: 'expense', color: '#7c3aed' },
  { id: 'bills', name: 'חשבונות וביטוחים', icon: '💡', type: 'expense', color: '#0891b2' },
  { id: 'health', name: 'בריאות ופארם', icon: '💊', type: 'expense', color: '#db2777' },
  { id: 'clothes', name: 'ביגוד והנעלה', icon: '👕', type: 'expense', color: '#c026d3' },
  { id: 'fun', name: 'בילוי ונסיעות', icon: '🎉', type: 'expense', color: '#f59e0b' },
  { id: 'subs', name: 'מנויים', icon: '🔁', type: 'expense', color: '#4f46e5' },
  { id: 'shopping', name: 'קניות', icon: '🛍️', type: 'expense', color: '#e11d48' },
  { id: 'edu', name: 'לימודים', icon: '📚', type: 'expense', color: '#0d9488' },
  { id: 'gifts', name: 'מתנות', icon: '🎁', type: 'expense', color: '#be123c' },
  { id: 'misc', name: 'שונות', icon: '📦', type: 'expense', color: '#64748b' },
  { id: 'salary', name: 'משכורת', icon: '💼', type: 'income', color: '#15803d' },
  { id: 'refund', name: 'החזרים וזיכויים', icon: '↩️', type: 'income', color: '#0e7490' },
  { id: 'other_in', name: 'הכנסה אחרת', icon: '➕', type: 'income', color: '#65a30d' },
];
const fresh = () => ({
  v: 1, txns: [], categories: DEFAULT_CATS.map(c => ({ ...c })), rules: [], cards: {},
  budget: { def: {}, months: {}, incomeDef: 0, incomeMonths: {} },
  settings: { monthStart: 1, inboxUrl: '', inboxKey: '', inboxSince: 0 },
  seen: {}, pending: [],
});
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return Object.assign(fresh(), s);
  } catch (e) { /* fall through */ }
  return fresh();
}
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('שגיאה בשמירה — הזיכרון מלא?'); } };
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ═════════════════════════ Helpers ═════════════════════════
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const money = (n, frac = false) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS',
  minimumFractionDigits: frac && n % 1 ? 2 : 0, maximumFractionDigits: frac ? 2 : 0 }).format(n || 0);
const cat = id => S.categories.find(c => c.id === id) || { id, name: 'ללא קטגוריה', icon: '❔', color: '#94a3b8', type: 'expense' };
const catsOf = type => S.categories.filter(c => c.type === type);
const defaultCat = type => type === 'income' ? 'other_in' : 'misc';

// Budget period ("month") — supports a custom start day, e.g. the card billing cycle
function periodKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const sd = S.settings.monthStart || 1;
  let yy = y, mm = m;
  if (d < sd) { mm--; if (mm < 1) { mm = 12; yy--; } }
  return `${yy}-${pad(mm)}`;
}
const shiftKey = (key, n) => { let [y, m] = key.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad(m)}`; };
function periodRange(key) {
  const [y, m] = key.split('-').map(Number), sd = S.settings.monthStart || 1;
  return { start: new Date(y, m - 1, sd), end: new Date(y, m, sd - 1) };
}
function periodLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  if ((S.settings.monthStart || 1) === 1) return name;
  const { start, end } = periodRange(key);
  return `${name} <small>(${start.getDate()}/${start.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1})</small>`;
}
const txOf = key => S.txns.filter(t => periodKey(t.date) === key);
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const budgetOf = (key, c) => { const m = S.budget.months[key]; return (m && m[c] != null) ? m[c] : (S.budget.def[c] || 0); };
const incomePlanOf = key => S.budget.incomeMonths[key] != null ? S.budget.incomeMonths[key] : (S.budget.incomeDef || 0);

function learnRule(merchant, catId) {
  const k = Parser.norm(merchant);
  if (!k || k.length < 2) return false;
  const ex = S.rules.find(r => r.k === k);
  if (ex) { if (ex.cat === catId) return false; ex.cat = catId; }
  else S.rules.unshift({ k, cat: catId });
  return true;
}
const autoCat = (text, type) => {
  const c = Parser.categorize(text, S.rules);
  if (c && cat(c).type === type) return c;
  if (type === 'income') return /זיכוי|ביטול|החזר/.test(text) ? 'refund' : defaultCat(type);
  return c && S.categories.some(x => x.id === c) ? c : defaultCat(type);
};

// ═════════════════════════ UI state ═════════════════════════
const ui = { tab: 'home', month: periodKey(today()), q: '', fcat: '', fnew: false };
let toastT;
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.innerHTML = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}
function monthBar() {
  return `<div class="monthbar">
    <button class="icon-btn" data-act="month" data-d="-1" aria-label="חודש קודם">›</button>
    <div class="month-label">${periodLabel(ui.month)}</div>
    <button class="icon-btn" data-act="month" data-d="1" aria-label="חודש הבא">‹</button>
  </div>`;
}

// ═════════════════════════ Charts (inline SVG) ═════════════════════════
function donut(items, total) {
  const R = 54, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = items.map(it => {
    const len = total ? it.value / total * C : 0;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${it.color}" stroke-width="22"
      stroke-dasharray="${Math.max(0, len - 1.2)} ${C}" stroke-dashoffset="${-off}" />`;
    off += len; return s;
  }).join('');
  return `<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="התפלגות הוצאות">
    <circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--track)" stroke-width="22"/>
    <g transform="rotate(-90 70 70)">${arcs}</g>
    <text x="70" y="66" text-anchor="middle" class="d-sub">הוצאות</text>
    <text x="70" y="86" text-anchor="middle" class="d-val">${esc(money(total))}</text></svg>`;
}
function trend(keys) {
  const data = keys.map(k => { const t = txOf(k); return { k, inc: sum(t.filter(x => x.type === 'income'), x => x.amount), exp: sum(t.filter(x => x.type === 'expense'), x => x.amount) }; });
  const max = Math.max(1, ...data.map(d => Math.max(d.inc, d.exp)));
  const W = 320, H = 130, bw = 14, gap = W / data.length;
  const bars = data.map((d, i) => {
    const x = (i + 0.5) * gap;                  // RTL: time flows right → left, so the oldest month sits on the right
    const hi = d.inc / max * (H - 26), he = d.exp / max * (H - 26);
    const [y, m] = d.k.split('-').map(Number);
    const lbl = new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'short' });
    return `<rect x="${x - bw - 1}" y="${H - 18 - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--income)"><title>הכנסות ${money(d.inc)}</title></rect>
      <rect x="${x + 1}" y="${H - 18 - he}" width="${bw}" height="${he}" rx="3" fill="var(--expense)"><title>הוצאות ${money(d.exp)}</title></rect>
      <text x="${x}" y="${H - 4}" text-anchor="middle" class="t-lbl">${lbl}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="trend" role="img" aria-label="הכנסות והוצאות בחצי השנה האחרונה">${bars}</svg>`;
}

// ═════════════════════════ Views ═════════════════════════
function viewHome() {
  const tx = txOf(ui.month);
  const inc = sum(tx.filter(t => t.type === 'income'), t => t.amount);
  const exp = sum(tx.filter(t => t.type === 'expense'), t => t.amount);
  const byCat = {};
  tx.filter(t => t.type === 'expense').forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, value: v, color: cat(id).color }));
  const planned = sum(catsOf('expense'), c => budgetOf(ui.month, c.id));
  const newCount = S.txns.filter(t => t.isNew).length;

  let budgetCard = '';
  if (planned > 0) {
    const pct = exp / planned * 100;
    const { start, end } = periodRange(ui.month);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let daily = '';
    if (now >= start && now <= end) {
      const daysLeft = Math.round((end - now) / 864e5) + 1;
      const left = planned - exp;
      daily = left > 0 ? `<div class="muted">נשארו ${daysLeft} ימים · אפשר להוציא <b>${money(left / daysLeft)}</b> ליום</div>`
                       : `<div class="muted warn">חרגת מהתקציב ב-${money(-left)}</div>`;
    }
    budgetCard = `<div class="card" data-act="tab" data-tab="budget">
      <div class="row-between"><b>תקציב החודש</b><span>${money(exp)} / ${money(planned)}</span></div>
      <div class="bar"><span style="width:${Math.min(100, pct)}%" class="${pct > 100 ? 'over' : pct > 85 ? 'near' : ''}"></span></div>
      ${daily}</div>`;
  } else {
    budgetCard = `<div class="card ghost" data-act="tab" data-tab="budget">🎯 עוד לא הגדרת תקציב לחודש הזה — <u>להגדרה</u></div>`;
  }

  const merchants = {};
  tx.filter(t => t.type === 'expense' && t.merchant).forEach(t => merchants[t.merchant] = (merchants[t.merchant] || 0) + t.amount);
  const topM = Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const keys = [0, 1, 2, 3, 4, 5].map(i => shiftKey(ui.month, -i));

  return `${monthBar()}
  ${S.pending.length ? `<div class="card alert" data-act="pending">⚠️ ${S.pending.length} הודעות לא זוהו אוטומטית — לחץ לטיפול</div>` : ''}
  ${newCount ? `<div class="card info" data-act="show-new">✨ ${newCount} עסקאות חדשות נכנסו מהודעות — לחץ לעבור עליהן</div>` : ''}
  <div class="kpis">
    <div class="kpi"><span>הכנסות</span><b class="inc">${money(inc)}</b></div>
    <div class="kpi"><span>הוצאות</span><b class="exp">${money(exp)}</b></div>
    <div class="kpi"><span>יתרה</span><b class="${inc - exp < 0 ? 'exp' : ''}">${money(inc - exp)}</b></div>
  </div>
  ${budgetCard}
  ${tx.length === 0 ? `<div class="card empty">
      <div class="big">👋</div><b>אין עדיין תנועות בחודש הזה</b>
      <p class="muted">הוסף הוצאה בכפתור + , הדבק הודעות מכאל/אמקס, או ייבא קובץ אקסל.</p>
      <div class="btns"><button class="primary" data-act="add">הוספת הוצאה</button><button data-act="tab" data-tab="more">ייבוא</button></div>
    </div>` : `
  <div class="card">
    <b>לאן הלך הכסף</b>
    <div class="donut-wrap">${donut(cats, exp)}
      <ul class="legend">${cats.slice(0, 7).map(c => `<li data-act="filter-cat" data-cat="${c.id}">
        <i style="background:${c.color}"></i><span>${cat(c.id).icon} ${esc(cat(c.id).name)}</span>
        <b>${money(c.value)}</b><small>${Math.round(c.value / exp * 100)}%</small></li>`).join('')}</ul>
    </div>
  </div>
  ${topM.length ? `<div class="card"><b>בתי עסק מובילים</b><ul class="simple">${topM.map(([m, v]) =>
      `<li><span>${esc(m)}</span><b>${money(v)}</b></li>`).join('')}</ul></div>` : ''}
  <div class="card"><div class="row-between"><b>חצי שנה אחרונה</b>
    <span class="chips-mini"><i class="dot inc-bg"></i>הכנסות <i class="dot exp-bg"></i>הוצאות</span></div>${trend(keys)}</div>
  <div class="card"><div class="row-between"><b>אחרונות</b><a data-act="tab" data-tab="tx">הכל</a></div>
    ${txList(tx.slice().sort(byDateDesc).slice(0, 5), false)}</div>`}`;
}
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);

function txRow(t) {
  const c = cat(t.category);
  return `<li class="tx" data-act="edit" data-id="${t.id}">
    <span class="ic" style="background:${c.color}22;color:${c.color}">${c.icon}</span>
    <span class="tx-main"><b>${esc(t.merchant || c.name)}${t.isNew ? ' <em class="badge">חדש</em>' : ''}</b>
      <small>${esc(c.name)}${t.card ? ' · ' + esc(t.card) : ''}${t.note ? ' · ' + esc(t.note) : ''}</small></span>
    <span class="tx-amt ${t.type === 'income' ? 'inc' : ''}">${t.type === 'income' ? '+' : ''}${money(t.amount, true)}</span>
  </li>`;
}
function txList(list, grouped = true) {
  if (!list.length) return `<p class="muted center">אין תנועות להצגה</p>`;
  if (!grouped) return `<ul class="txs">${list.map(txRow).join('')}</ul>`;
  const groups = {};
  list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  return Object.keys(groups).sort().reverse().map(d => {
    const lbl = parseISO(d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    const day = sum(groups[d].filter(t => t.type === 'expense'), t => t.amount);
    return `<div class="day"><div class="day-h"><span>${lbl}</span><span>${day ? money(day, true) : ''}</span></div>
      <ul class="txs">${groups[d].map(txRow).join('')}</ul></div>`;
  }).join('');
}

function viewTx() {
  let list = ui.fnew ? S.txns.filter(t => t.isNew) : txOf(ui.month);
  if (ui.fcat) list = list.filter(t => t.category === ui.fcat);
  if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter(t => `${t.merchant} ${t.note} ${cat(t.category).name}`.toLowerCase().includes(q)); }
  list.sort(byDateDesc);
  const total = sum(list.filter(t => t.type === 'expense'), t => t.amount);
  return `${ui.fnew ? `<div class="monthbar"><div class="month-label">עסקאות חדשות מהודעות</div></div>` : monthBar()}
  <div class="filters">
    <input type="search" id="q" placeholder="חיפוש בית עסק / הערה" value="${esc(ui.q)}">
    <select id="fcat"><option value="">כל הקטגוריות</option>${S.categories.map(c =>
      `<option value="${c.id}" ${ui.fcat === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select>
  </div>
  ${ui.fnew ? `<div class="card info row-between"><span>הקטגוריות נבחרו אוטומטית. לחץ על עסקה כדי לתקן.</span>
     <button data-act="approve-new">אשר הכל</button></div>` : ''}
  <div class="muted small" style="margin:4px 4px 10px">${list.length} תנועות · הוצאות ${money(total, true)}</div>
  ${txList(list)}`;
}

function viewBudget() {
  const tx = txOf(ui.month);
  const spent = {};
  tx.filter(t => t.type === 'expense').forEach(t => spent[t.category] = (spent[t.category] || 0) + t.amount);
  const incPlan = incomePlanOf(ui.month);
  const incAct = sum(tx.filter(t => t.type === 'income'), t => t.amount);
  const cats = catsOf('expense');
  const planned = sum(cats, c => budgetOf(ui.month, c.id));
  const totalSpent = sum(Object.values(spent));
  const isFuture = ui.month > periodKey(today());
  return `${monthBar()}
  <div class="card">
    <div class="row-between"><b>הכנסה צפויה</b>
      <input class="num-in" inputmode="decimal" data-budget="__income" value="${incPlan || ''}" placeholder="0"></div>
    <div class="muted small">בפועל עד עכשיו: ${money(incAct)}</div>
  </div>
  <div class="kpis">
    <div class="kpi"><span>מתוכנן</span><b>${money(planned)}</b></div>
    <div class="kpi"><span>${isFuture ? 'נוצל' : 'הוצא'}</span><b class="exp">${money(totalSpent)}</b></div>
    <div class="kpi"><span>חיסכון צפוי</span><b class="${incPlan - planned < 0 ? 'exp' : 'inc'}">${money(incPlan - planned)}</b></div>
  </div>
  <div class="btn-row">
    <button data-act="budget-copy">העתק מהחודש הקודם</button>
    <button data-act="budget-default">קבע כתקציב קבוע לכל חודש</button>
  </div>
  <div class="card">
    ${cats.map(c => {
      const b = budgetOf(ui.month, c.id), s = spent[c.id] || 0, pct = b ? s / b * 100 : (s ? 100 : 0);
      return `<div class="b-row">
        <div class="row-between"><span>${c.icon} ${esc(c.name)}</span>
          <input class="num-in" inputmode="decimal" data-budget="${c.id}" value="${b || ''}" placeholder="0"></div>
        <div class="bar thin"><span style="width:${Math.min(100, pct)}%;background:${pct > 100 ? 'var(--expense)' : c.color}"></span></div>
        <div class="muted small">${money(s)} ${b ? `מתוך ${money(b)} · ${s > b ? `<span class="warn">חריגה ${money(s - b)}</span>` : `נשאר ${money(b - s)}`}` : 'ללא תקציב'}</div>
      </div>`;
    }).join('')}
  </div>
  <p class="muted small center">טיפ: עבור לחודשים הבאים עם החיצים למעלה כדי לתכנן תקציב קדימה.</p>`;
}

function viewMore() {
  const st = S.settings;
  return `<h2 class="sec-h">ייבוא נתונים</h2>
  <div class="card">
    <b>📩 הדבקת הודעות מכאל / אמקס</b>
    <p class="muted small">העתק הודעה אחת או כמה הודעות (שורה ריקה בין הודעה להודעה) והדבק כאן.</p>
    <textarea id="sms-in" rows="4" placeholder="לדוגמה: כאל: בכרטיסך המסתיים ב-1234 אושרה עסקה ב-12/10 בסך 150.00 ש&quot;ח בשופרסל"></textarea>
    <div class="btns"><button class="primary" data-act="parse-sms">זהה והוסף</button><button data-act="paste-clip">הדבק מהלוח</button></div>
  </div>
  <div class="card">
    <b>📊 ייבוא אקסל / CSV</b>
    <p class="muted small">פירוט חיובים שהורדת מאתר כאל / אמקס / ישראכרט / מקס, או האקסלים החודשיים הקודמים שלך (עמודות: תאריך, תיאור/בית עסק, סכום, ואם יש — קטגוריה).</p>
    <label class="file-btn">בחירת קובץ<input type="file" id="file-in" accept=".xlsx,.xls,.csv" hidden></label>
  </div>
  <div class="card">
    <b>⚡ הודעות אוטומטיות (Google Sheets)</b>
    <p class="muted small">כל הודעה מכאל/אמקס נשלחת אוטומטית מהטלפון לגיליון שלך, והאפליקציה מושכת אותה ומסווגת. <a href="guide.html#auto">איך מחברים?</a></p>
    <label>כתובת ה-Web App<input id="inbox-url" dir="ltr" value="${esc(st.inboxUrl)}" placeholder="https://script.google.com/macros/s/.../exec"></label>
    <label>מפתח סודי<input id="inbox-key" dir="ltr" value="${esc(st.inboxKey)}" placeholder="המפתח שהגדרת בסקריפט"></label>
    <div class="btns"><button class="primary" data-act="inbox-save">שמור ובדוק חיבור</button>${st.inboxUrl ? `<button data-act="inbox-pull">משוך עכשיו</button>` : ''}</div>
    ${st.inboxUrl ? `<div class="muted small">${st.inboxLast ? 'סנכרון אחרון: ' + new Date(st.inboxLast).toLocaleString('he-IL') : ''}</div>` : ''}
  </div>

  <h2 class="sec-h">הגדרות</h2>
  <div class="card">
    <div class="row-between"><b>החודש מתחיל ביום</b>
      <select id="month-start">${Array.from({ length: 28 }, (_, i) => `<option ${st.monthStart === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
    <p class="muted small">למשל 10 — אם נוח לך לעקוב לפי מחזור החיוב של הכרטיס.</p>
  </div>
  <div class="card">
    <div class="row-between"><b>קטגוריות</b><button data-act="cat-new">+ חדשה</button></div>
    <ul class="simple">${S.categories.map(c => `<li data-act="cat-edit" data-id="${c.id}"><span>${c.icon} ${esc(c.name)}</span>
      <small class="muted">${c.type === 'income' ? 'הכנסה' : 'הוצאה'}</small></li>`).join('')}</ul>
  </div>
  <div class="card">
    <b>כללי סיווג שנלמדו</b>
    <p class="muted small">כשאתה משנה קטגוריה לבית עסק, האפליקציה זוכרת את זה לפעם הבאה.</p>
    ${S.rules.length ? `<ul class="simple">${S.rules.map((r, i) => `<li><span>${esc(r.k)} ← ${cat(r.cat).icon} ${esc(cat(r.cat).name)}</span>
      <button class="icon-btn sm" data-act="rule-del" data-i="${i}" aria-label="מחק">✕</button></li>`).join('')}</ul>` : '<p class="muted small">עדיין אין.</p>'}
  </div>
  <div class="card">
    <b>גיבוי</b>
    <p class="muted small">הנתונים נשמרים רק בטלפון שלך. מומלץ לגבות פעם בחודש (לשמור את הקובץ ב-Drive / iCloud).</p>
    <div class="btns"><button data-act="export-json">גיבוי לקובץ</button>
      <label class="file-btn">שחזור מגיבוי<input type="file" id="restore-in" accept=".json" hidden></label>
      <button data-act="export-csv">ייצוא לאקסל (CSV)</button></div>
  </div>
  <div class="card">
    <a href="guide.html" class="primary-link">📖 מדריך התקנה וחיבור הודעות</a>
  </div>
  <div class="card danger-zone"><button class="danger" data-act="wipe">מחיקת כל הנתונים</button></div>
  <p class="muted small center">כספית · ${S.txns.length} תנועות שמורות</p>`;
}

// ═════════════════════════ Render ═════════════════════════
function render() {
  const main = $('#main');
  const views = { home: viewHome, tx: viewTx, budget: viewBudget, more: viewMore };
  main.innerHTML = views[ui.tab]();
  $$('.nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  bindView();
}
function bindView() {
  const q = $('#q');
  if (q) q.oninput = () => { ui.q = q.value; const pos = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
  const fc = $('#fcat'); if (fc) fc.onchange = () => { ui.fcat = fc.value; render(); };
  $$('[data-budget]').forEach(inp => inp.onchange = () => {
    const v = parseFloat(inp.value.replace(/,/g, '')) || 0;
    if (inp.dataset.budget === '__income') S.budget.incomeMonths[ui.month] = v;
    else (S.budget.months[ui.month] = S.budget.months[ui.month] || {})[inp.dataset.budget] = v;
    save(); render();
  });
  const ms = $('#month-start'); if (ms) ms.onchange = () => { S.settings.monthStart = +ms.value; ui.month = periodKey(today()); save(); toast('עודכן'); };
  const fi = $('#file-in'); if (fi) fi.onchange = () => { if (fi.files[0]) importFile(fi.files[0]); fi.value = ''; };
  const ri = $('#restore-in'); if (ri) ri.onchange = () => { if (ri.files[0]) restore(ri.files[0]); ri.value = ''; };
}

// ═════════════════════════ Sheets (modal bottom sheets) ═════════════════════════
function openSheet(html) {
  const sh = $('#sheet');
  $('#sheet-body').innerHTML = html;
  sh.hidden = false; requestAnimationFrame(() => sh.classList.add('open'));
  document.body.classList.add('locked');
}
function closeSheet() {
  const sh = $('#sheet'); sh.classList.remove('open'); document.body.classList.remove('locked');
  setTimeout(() => { sh.hidden = true; $('#sheet-body').innerHTML = ''; }, 220);
}

let form = null;   // state of the add/edit sheet
function openTxSheet(tx = null, preset = {}) {
  const t = tx || { type: 'expense', amount: '', merchant: '', category: '', date: today(), note: '', ...preset };
  form = { id: tx ? tx.id : null, type: t.type, category: t.category, catTouched: !!tx || !!preset.category, origCat: tx ? tx.category : null };
  const merchants = [...new Set(S.txns.map(x => x.merchant).filter(Boolean))].slice(0, 300);
  openSheet(`<div class="sheet-h"><b>${tx ? 'עריכת תנועה' : 'תנועה חדשה'}</b><button class="icon-btn" data-act="close" aria-label="סגור">✕</button></div>
    <div class="seg" id="f-type"><button data-act="ftype" data-v="expense">הוצאה</button><button data-act="ftype" data-v="income">הכנסה</button></div>
    <div class="amount-wrap"><span>₪</span><input id="f-amount" inputmode="decimal" placeholder="0" value="${t.amount || ''}" autocomplete="off"></div>
    <input id="f-merchant" list="merchant-list" placeholder="בית עסק / תיאור" value="${esc(t.merchant)}" autocomplete="off">
    <datalist id="merchant-list">${merchants.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="cat-grid" id="f-cats"></div>
    <div class="two"><input type="date" id="f-date" value="${t.date}"><input id="f-note" placeholder="הערה" value="${esc(t.note)}"></div>
    ${tx && tx.raw ? `<details class="raw"><summary>ההודעה המקורית</summary><p>${esc(tx.raw)}</p></details>` : ''}
    <div class="btns">
      <button class="primary grow" data-act="save-tx">שמור</button>
      ${tx ? `<button class="danger" data-act="del-tx">מחק</button>` : `<button data-act="save-tx" data-more="1">שמור + עוד</button>`}
    </div>`);
  drawFormType();
  const amt = $('#f-amount');
  if (!tx) setTimeout(() => amt.focus(), 250);
  $('#f-merchant').oninput = e => {
    if (form.catTouched) return;
    form.category = autoCat(e.target.value, form.type);
    drawCats();
  };
}
function drawFormType() {
  $$('#f-type button').forEach(b => b.classList.toggle('on', b.dataset.v === form.type));
  if (!form.category || cat(form.category).type !== form.type) form.category = autoCat($('#f-merchant')?.value || '', form.type);
  drawCats();
}
function drawCats() {
  $('#f-cats').innerHTML = catsOf(form.type).map(c => `<button class="cat-chip ${form.category === c.id ? 'on' : ''}"
    data-act="fcat" data-v="${c.id}" style="--c:${c.color}"><span>${c.icon}</span>${esc(c.name)}</button>`).join('');
}
function saveTx(more) {
  const amount = parseFloat(($('#f-amount').value || '').replace(/,/g, ''));
  if (!(amount > 0)) { toast('הזן סכום'); $('#f-amount').focus(); return; }
  const data = { type: form.type, amount: Math.round(amount * 100) / 100, merchant: $('#f-merchant').value.trim(),
                 category: form.category || defaultCat(form.type), date: $('#f-date').value || today(), note: $('#f-note').value.trim() };
  let learned = false;
  if (form.id) {
    const t = S.txns.find(x => x.id === form.id);
    if (form.origCat !== data.category && data.merchant) learned = learnRule(data.merchant, data.category);
    Object.assign(t, data); delete t.isNew;
  } else {
    S.txns.push({ id: uid(), source: 'manual', createdAt: Date.now(), ...data });
    if (data.merchant && form.catTouched && Parser.categorize(data.merchant, S.rules) !== data.category) learned = learnRule(data.merchant, data.category);
  }
  save();
  if (learned) toast(`נלמד: "${esc(data.merchant)}" ← ${esc(cat(data.category).name)}`); else toast('נשמר ✓');
  if (more) openTxSheet(null, { type: data.type, date: data.date }); else closeSheet();
  render();
}

function openCatSheet(c = null) {
  const x = c || { id: '', name: '', icon: '📌', type: 'expense', color: '#6366f1' };
  openSheet(`<div class="sheet-h"><b>${c ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</b><button class="icon-btn" data-act="close">✕</button></div>
    <div class="two"><input id="c-icon" value="${esc(x.icon)}" maxlength="4" class="emoji-in" aria-label="אייקון"><input id="c-name" value="${esc(x.name)}" placeholder="שם הקטגוריה"></div>
    <div class="two"><select id="c-type"><option value="expense" ${x.type === 'expense' ? 'selected' : ''}>הוצאה</option>
      <option value="income" ${x.type === 'income' ? 'selected' : ''}>הכנסה</option></select>
      <input type="color" id="c-color" value="${x.color}"></div>
    <div class="btns"><button class="primary grow" data-act="cat-save" data-id="${x.id}">שמור</button>
      ${c ? `<button class="danger" data-act="cat-del" data-id="${x.id}">מחק</button>` : ''}</div>`);
}

// ═════════════════════════ Import: review list ═════════════════════════
let review = [];
function isDup(c) {
  if (c.hash && S.seen[c.hash]) return true;
  const d0 = parseISO(c.date);
  const mk = s => Parser.norm(s).toLowerCase().replace(/[^a-z0-9֐-׿]/g, '').slice(0, 4);
  const m0 = mk(c.merchant);
  return S.txns.some(t => Math.abs(t.amount - c.amount) < 0.01 && t.type === c.type &&
    Math.abs(parseISO(t.date) - d0) <= 2 * 864e5 && (!m0 || !t.merchant || mk(t.merchant) === m0));
}
function toCandidate(p, source) {
  const type = p.type || 'expense';
  const hint = [p.merchant, p.sector].filter(Boolean).join(' ');
  let category = null;
  if (p.sector) { const byName = S.categories.find(c => c.name === p.sector.trim() && c.type === type); if (byName) category = byName.id; }
  const issuer = p.issuer || '';
  const card = p.card ? (S.cards[p.card] || [issuer, p.card].filter(Boolean).join(' ')) : issuer;
  if (!category && type === 'income' && (source !== 'file' || issuer)) {   // income on a card = refund / cancellation
    const r = Parser.categorize(hint, S.rules);
    category = r && cat(r).type === 'income' ? r : 'refund';
  }
  const c = { type, amount: p.amount, merchant: p.merchant || '', date: p.date, note: p.note || '', card,
              category: category || autoCat(hint || p.raw || '', type), raw: p.raw || '', hash: p.hash || '', source };
  c.dup = isDup(c); c.on = !c.dup;
  return c;
}
function openReview(cands, failed = []) {
  review = cands;
  if (!cands.length && !failed.length) { toast('לא נמצאו תנועות'); return; }
  const opts = type => catsOf(type);
  openSheet(`<div class="sheet-h"><b>בדיקה לפני הוספה</b><button class="icon-btn" data-act="close">✕</button></div>
    ${cands.length ? `<p class="muted small">${cands.length} תנועות זוהו. אפשר לתקן קטגוריה או סכום לפני השמירה.${cands.some(c => c.dup) ? ' תנועות שנראות כפולות לא מסומנות.' : ''}</p>` : ''}
    <ul class="review">${cands.map((c, i) => `<li class="${c.dup ? 'dup' : ''}">
      <label class="chk"><input type="checkbox" data-r="on" data-i="${i}" ${c.on ? 'checked' : ''}></label>
      <div class="r-main">
        <div class="two"><input data-r="merchant" data-i="${i}" value="${esc(c.merchant)}" placeholder="בית עסק">
          <input data-r="amount" data-i="${i}" inputmode="decimal" value="${c.amount}" class="r-amt"></div>
        <div class="two"><select data-r="category" data-i="${i}">${opts(c.type).map(o => `<option value="${o.id}" ${o.id === c.category ? 'selected' : ''}>${o.icon} ${esc(o.name)}</option>`).join('')}</select>
          <input type="date" data-r="date" data-i="${i}" value="${c.date}"></div>
        <small class="muted">${c.type === 'income' && !c.note ? 'זיכוי · ' : ''}${esc(c.card)}${c.note ? ' · ' + esc(c.note) : ''}${c.dup ? ' · <b>נראה כפול</b>' : ''}</small>
      </div></li>`).join('')}</ul>
    ${failed.length ? `<div class="card alert"><b>${failed.length} הודעות לא זוהו</b>${failed.map(f => `<p class="small">${esc(f.raw || f.text).slice(0, 160)}<br><i class="muted">${esc(f.reason || '')}</i></p>`).join('')}
      <p class="muted small">אפשר להוסיף אותן ידנית, ואם זה קורה הרבה — שלח לי דוגמה של ההודעה ואתאים את הזיהוי.</p></div>` : ''}
    ${cands.length ? `<div class="btns"><button class="primary grow" data-act="review-save">הוסף מסומנות</button></div>` : ''}`);
  $$('#sheet-body [data-r]').forEach(el => el.onchange = () => {
    const c = review[+el.dataset.i], k = el.dataset.r;
    c[k] = k === 'on' ? el.checked : k === 'amount' ? parseFloat(el.value) || 0 : el.value;
  });
}
function saveReview() {
  let n = 0, learned = 0;
  for (const c of review) {
    if (!c.on || !(c.amount > 0)) continue;
    const auto = autoCat([c.merchant].join(' '), c.type);
    if (c.merchant && c.category !== auto && learnRule(c.merchant, c.category)) learned++;
    S.txns.push({ id: uid(), createdAt: Date.now(), type: c.type, amount: c.amount, merchant: c.merchant, category: c.category,
                  date: c.date, note: c.note, card: c.card, source: c.source, raw: c.raw || undefined });
    if (c.hash) S.seen[c.hash] = 1;
    n++;
  }
  save(); closeSheet(); render();
  toast(`נוספו ${n} תנועות${learned ? ` · נלמדו ${learned} כללים` : ''}`);
}

function parseSmsText(text) {
  const now = new Date(), cands = [], failed = [];
  for (const msg of Parser.splitMessages(text)) {
    const p = Parser.parseSms(msg, now);
    if (!p.ok) { if (!p.skip) failed.push(p); continue; }
    p.hash = Parser.hash(msg);
    cands.push(toCandidate(p, 'sms'));
  }
  openReview(cands, failed);
}

// Statement / personal Excel files
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => rej(new Error('נדרש חיבור לאינטרנט לקריאת קבצי אקסל'));
    document.head.appendChild(s);
  });
}
async function importFile(file) {
  try {
    toast('קורא את הקובץ…');
    await loadXLSX();
    const buf = await file.arrayBuffer();
    let wb;
    if (/\.csv$/i.test(file.name)) {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1255').decode(buf); }
      wb = XLSX.read(text, { type: 'string', raw: false });
    } else wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const rows = [];
    wb.SheetNames.forEach(n => rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })));
    const parsed = Parser.parseTable(rows);
    if (!parsed.length) { toast('לא זיהיתי טבלת תנועות בקובץ. צריך עמודות: תאריך, בית עסק/תיאור, סכום', 4500); return; }
    const issuer = Parser.detectIssuer(file.name + ' ' + rows.slice(0, 8).flat().join(' '));
    openReview(parsed.map(p => toCandidate({ ...p, issuer }, 'file')));
  } catch (e) { toast(e.message || 'שגיאה בקריאת הקובץ', 4000); }
}

// ═════════════════════════ Auto inbox (Google Apps Script) ═════════════════════════
let pulling = false;
async function pullInbox(manual = false) {
  const st = S.settings;
  if (!st.inboxUrl || !st.inboxKey || pulling) return;
  pulling = true;
  try {
    const url = `${st.inboxUrl}?action=list&key=${encodeURIComponent(st.inboxKey)}&since=${st.inboxSince || 0}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error === 'bad key' ? 'מפתח שגוי' : (j.error || 'שגיאה'));
    let added = 0, failed = 0;
    const now = new Date();
    for (const it of j.items || []) {
      st.inboxSince = Math.max(st.inboxSince || 0, it.id);
      const h = Parser.hash(it.text);
      if (S.seen[h]) continue;
      const p = Parser.parseSms(it.text, now);
      if (!p.ok) { if (!p.skip) { S.pending.push({ id: it.id, text: it.text, reason: p.reason }); failed++; } S.seen[h] = 1; continue; }
      p.hash = h;
      const c = toCandidate(p, 'auto');
      S.seen[h] = 1;
      if (c.dup) continue;
      S.txns.push({ id: uid(), createdAt: Date.now(), type: c.type, amount: c.amount, merchant: c.merchant, category: c.category,
                    date: c.date, note: c.note, card: c.card, source: 'auto', raw: c.raw, isNew: true });
      added++;
    }
    st.inboxLast = Date.now();
    save();
    if (added || failed) { toast(`${added ? `נכנסו ${added} עסקאות חדשות` : ''}${added && failed ? ' · ' : ''}${failed ? `${failed} לא זוהו` : ''}`); render(); }
    else if (manual) toast('אין הודעות חדשות');
    return true;
  } catch (e) {
    if (manual) toast('החיבור נכשל: ' + (e.message || e), 4500);
    return false;
  } finally { pulling = false; }
}

// ═════════════════════════ Backup ═════════════════════════
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
async function restore(file) {
  try {
    const s = JSON.parse(await file.text());
    if (!s || s.v !== 1 || !Array.isArray(s.txns)) throw new Error();
    if (!confirm(`לשחזר ${s.txns.length} תנועות? הנתונים הנוכחיים יוחלפו.`)) return;
    S = Object.assign(fresh(), s); save(); render(); toast('שוחזר ✓');
  } catch (e) { toast('קובץ גיבוי לא תקין'); }
}

// ═════════════════════════ Actions ═════════════════════════
const actions = {
  tab: el => { ui.tab = el.dataset.tab; ui.fnew = false; render(); window.scrollTo(0, 0); },
  month: el => { ui.month = shiftKey(ui.month, +el.dataset.d); render(); },
  add: () => openTxSheet(),
  close: closeSheet,
  edit: el => openTxSheet(S.txns.find(t => t.id === el.dataset.id)),
  ftype: el => { form.type = el.dataset.v; drawFormType(); },
  fcat: el => { form.category = el.dataset.v; form.catTouched = true; drawCats(); },
  'save-tx': el => saveTx(!!el.dataset.more),
  'del-tx': () => { if (!confirm('למחוק את התנועה?')) return; S.txns = S.txns.filter(t => t.id !== form.id); save(); closeSheet(); render(); toast('נמחק'); },
  'filter-cat': el => { ui.tab = 'tx'; ui.fcat = el.dataset.cat; render(); },
  'show-new': () => { ui.tab = 'tx'; ui.fnew = true; ui.fcat = ''; ui.q = ''; render(); },
  'approve-new': () => { S.txns.forEach(t => delete t.isNew); save(); ui.fnew = false; render(); toast('אושר ✓'); },
  pending: () => {
    const items = S.pending.map(p => ({ raw: p.text, reason: p.reason }));
    S.pending = []; save();
    openReview([], items); render();
  },
  'budget-copy': () => {
    const prev = shiftKey(ui.month, -1), m = {};
    catsOf('expense').forEach(c => m[c.id] = budgetOf(prev, c.id));
    S.budget.months[ui.month] = m; S.budget.incomeMonths[ui.month] = incomePlanOf(prev);
    save(); render(); toast('הועתק מהחודש הקודם');
  },
  'budget-default': () => {
    catsOf('expense').forEach(c => S.budget.def[c.id] = budgetOf(ui.month, c.id));
    S.budget.incomeDef = incomePlanOf(ui.month);
    save(); toast('נקבע כתקציב ברירת מחדל לכל החודשים שלא הוגדרו בנפרד');
  },
  'parse-sms': () => { const v = $('#sms-in').value; if (!v.trim()) return toast('הדבק קודם הודעה'); parseSmsText(v); $('#sms-in').value = ''; },
  'paste-clip': async () => {
    try { const t = await navigator.clipboard.readText(); if (!t) return toast('הלוח ריק'); $('#sms-in').value = t; parseSmsText(t); }
    catch (e) { toast('אין גישה ללוח — הדבק ידנית בתיבה'); }
  },
  'review-save': saveReview,
  'inbox-save': async () => {
    S.settings.inboxUrl = $('#inbox-url').value.trim(); S.settings.inboxKey = $('#inbox-key').value.trim(); save();
    if (!S.settings.inboxUrl) return render();
    toast('בודק חיבור…');
    if (await pullInbox(true)) toast('מחובר ✓ ההודעות ייכנסו אוטומטית בכל פתיחה של האפליקציה', 4000);
    render();
  },
  'inbox-pull': () => pullInbox(true),
  'cat-new': () => openCatSheet(),
  'cat-edit': el => openCatSheet(cat(el.dataset.id)),
  'cat-save': el => {
    const name = $('#c-name').value.trim(); if (!name) return toast('הזן שם');
    const data = { name, icon: $('#c-icon').value.trim() || '📌', type: $('#c-type').value, color: $('#c-color').value };
    if (el.dataset.id) Object.assign(cat(el.dataset.id), data); else S.categories.push({ id: 'c' + uid(), ...data });
    save(); closeSheet(); render();
  },
  'cat-del': el => {
    const id = el.dataset.id, n = S.txns.filter(t => t.category === id).length;
    if (!confirm(n ? `${n} תנועות בקטגוריה יועברו ל"שונות". למחוק?` : 'למחוק את הקטגוריה?')) return;
    const c = cat(id);
    S.txns.forEach(t => { if (t.category === id) t.category = defaultCat(c.type); });
    S.rules = S.rules.filter(r => r.cat !== id);
    S.categories = S.categories.filter(x => x.id !== id);
    save(); closeSheet(); render();
  },
  'rule-del': el => { S.rules.splice(+el.dataset.i, 1); save(); render(); },
  'export-json': () => download(`kesef-backup-${today()}.json`, JSON.stringify(S), 'application/json'),
  'export-csv': () => {
    const rows = [['תאריך', 'סוג', 'סכום', 'קטגוריה', 'בית עסק', 'כרטיס', 'הערה']]
      .concat(S.txns.slice().sort(byDateDesc).map(t => [t.date, t.type === 'income' ? 'הכנסה' : 'הוצאה', t.amount, cat(t.category).name, t.merchant, t.card || '', t.note || '']));
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`kesef-${today()}.csv`, csv, 'text/csv;charset=utf-8');
  },
  wipe: () => {
    if (!confirm('למחוק את כל הנתונים? אי אפשר לשחזר בלי קובץ גיבוי.')) return;
    if (!confirm('בטוח? זו פעולה סופית.')) return;
    S = fresh(); save(); render(); toast('נמחק');
  },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.id === 'sheet') closeSheet(); return; }
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ui.month = ui.month || periodKey(today()); pullInbox(); } });

// ═════════════════════════ Boot ═════════════════════════
render();
// Text arriving via URL (Android share target / automation): ?sms=... or ?text=...
{
  const p = new URLSearchParams(location.search);
  const incoming = p.get('sms') || p.get('text') || p.get('title');
  if (incoming) { history.replaceState(null, '', location.pathname); ui.tab = 'more'; render(); parseSmsText(incoming); }
}
pullInbox();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
