// CHANGELOG.md: Quelle der Version und des Texts jeder Release. Überschriften der Abschnitte haben die Form
// «## 2026.12.02 (2. Dezember 2026)». Der oberste Abschnitt ist die aktuelle Version. Darunter steht je Änderung eine Zeile
// «- …» auf Deutsch; ein Unterabschnitt «### Français» enthält auf Wunsch den französischen Text für Download-Seite und Hinweis.
// Versionsschema JJJJ.MM.TT[-n] wie src/app/lib/updatecheck.js (verteilte Kopien lesen nur diese Form).
import { parseVersion, compareVersions } from '../../src/app/lib/updatecheck.js';

const HEAD = /^## +(\S+)(?: +\(([^)]*)\))?\s*$/;
export const FR_HEAD = /^### +Fran(ç|c)ais\s*$/i;

/** Alle Abschnitte: [{ version, date, line }] in der Reihenfolge der Datei. version ist der Text wie geschrieben. */
export function changelogEntries(markdown) {
  const out = [];
  String(markdown || '').split(/\r?\n/).forEach((l, i) => { const m = HEAD.exec(l); if (m) out.push({ version: m[1], date: m[2] || null, line: i + 1 }); });
  return out;
}

/** Version des obersten Abschnitts oder null. */
export const latestVersion = (markdown) => (changelogEntries(markdown)[0] || {}).version || null;

/** Text eines Abschnitts ohne Überschrift: { de, fr } (fr null ohne «### Français»); null, wenn der Abschnitt fehlt oder leer ist. */
export function changelogSection(markdown, version) {
  const lines = String(markdown || '').split(/\r?\n/);
  const start = lines.findIndex((l) => { const m = HEAD.exec(l); return m && m[1] === version; });
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && HEAD.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end);
  const fr = body.findIndex((l) => FR_HEAD.test(l));
  const de = (fr < 0 ? body : body.slice(0, fr)).join('\n').trim();
  const frText = fr < 0 ? null : body.slice(fr + 1).join('\n').trim() || null;
  return de ? { de, fr: frText } : null;
}

/** Kurztext (eine Zeile, ohne Markdown) für den Hinweis im Werkzeug und die Download-Seite. */
export function plainNotes(text, max = 400) {
  const s = String(text || '').split(/\r?\n/).map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean).join(' ')
    .replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]*)\*\*/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …' : s;
}

/**
 * Prüft CHANGELOG.md. Ergebnis { ok, version, errors: [Text] }. Fehler: kein Abschnitt, Version nicht im Schema,
 * oberster Abschnitt leer, Versionen nicht absteigend, Version doppelt.
 */
export function checkChangelog(markdown) {
  const errors = [];
  const entries = changelogEntries(markdown);
  if (!entries.length) return { ok: false, version: null, errors: ['CHANGELOG.md: kein Abschnitt «## JJJJ.MM.TT (Datum)» gefunden.'] };
  const seen = new Set();
  entries.forEach((e, i) => {
    const v = parseVersion(e.version);
    if (!v || v.text !== e.version) errors.push(`CHANGELOG.md, Zeile ${e.line}: Version «${e.version}» hat nicht die Form JJJJ.MM.TT oder JJJJ.MM.TT-2 (zum Beispiel 2026.12.02).`);
    if (seen.has(e.version)) errors.push(`CHANGELOG.md, Zeile ${e.line}: Version ${e.version} kommt zweimal vor.`);
    seen.add(e.version);
    const prev = entries[i - 1];
    if (prev && v && parseVersion(prev.version) && compareVersions(prev.version, e.version) <= 0) errors.push(`CHANGELOG.md, Zeile ${prev.line}: Version ${prev.version} muss neuer sein als die darunter stehende ${e.version}. Die neueste Version steht zuoberst.`);
  });
  const top = entries[0];
  if (!changelogSection(markdown, top.version)) errors.push(`CHANGELOG.md, Zeile ${top.line}: Abschnitt ${top.version} ist leer. Darunter gehört je Änderung eine Zeile «- …».`);
  return { ok: errors.length === 0, version: top.version, errors };
}

/** Neuen Abschnitt zuoberst einfügen (nach der Titelzeile «# …», falls vorhanden). */
export function insertChangelog(markdown, version, dateText, lines) {
  const block = [`## ${version} (${dateText})`, '', ...lines.map((l) => `- ${l}`), ''];
  const all = String(markdown || '# Änderungen\n').split(/\r?\n/);
  const at = all.findIndex((l) => HEAD.test(l));
  if (at < 0) return [...all.filter((l, i) => i < all.length - 1 || l), '', ...block].join('\n');
  return [...all.slice(0, at), ...block, ...all.slice(at)].join('\n');
}

/** Nächste freie Version zum Datum (JJJJ-MM-TT): JJJJ.MM.TT, sonst -2, -3 … (taken: Liste vergebener Versionen). */
export function nextVersion(isoDate, taken = []) {
  const base = isoDate.replace(/-/g, '.');
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) if (!set.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Datum in der Schreibweise der Überschrift: «2. Dezember 2026». */
export const fmtDateDe = (iso) => new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
export const todayZurich = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(d);
