/**
 * כספית — תיבת הודעות אוטומטית
 * מקבל הודעות כרטיס אשראי מהטלפון (קיצור דרך באייפון / MacroDroid באנדרואיד),
 * שומר אותן בגיליון "inbox", והאפליקציה מושכת אותן משם.
 *
 * 1. שנה את SECRET למשהו ארוך שרק אתה יודע (אותיות ומספרים באנגלית).
 * 2. פרוס (Deploy) כ-Web app:  Execute as: Me ,  Who has access: Anyone
 */
const SECRET = 'CHANGE-ME-to-a-long-random-key';

function doPost(e) {
  let data = {};
  const body = e && e.postData ? e.postData.contents : '';
  try { data = JSON.parse(body); } catch (err) { data = { text: body }; }
  const key = data.key || (e.parameter && e.parameter.key);
  if (key !== SECRET) return out_({ ok: false, error: 'bad key' });
  return out_(add_(data.text || (e.parameter && e.parameter.text)));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== SECRET) return out_({ ok: false, error: 'bad key' });
  if (p.action === 'add') return out_(add_(p.text));
  const since = Number(p.since || 0);
  const sh = sheet_();
  const n = sh.getLastRow();
  const rows = n > 1 ? sh.getRange(2, 1, n - 1, 3).getValues() : [];
  const items = rows
    .filter(r => Number(r[0]) > since && String(r[2]).trim())
    .map(r => ({ id: Number(r[0]), ts: r[1], text: String(r[2]) }));
  return out_({ ok: true, items: items });
}

function add_(text) {
  text = String(text || '').trim();
  if (!text) return { ok: false, error: 'empty' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const id = sh.getLastRow();          // header is row 1 → first message gets id 1
    sh.appendRow([id, new Date(), text]);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('inbox');
  if (!sh) { sh = ss.insertSheet('inbox'); sh.appendRow(['id', 'received', 'text']); sh.setFrozenRows(1); }
  return sh;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** בדיקה ידנית מתוך העורך: בחר testAdd ולחץ Run */
function testAdd() {
  Logger.log(add_('כאל: בכרטיסך המסתיים ב-1234 אושרה עסקה ב-12/10 בסך 45.90 ש"ח בארומה'));
}
