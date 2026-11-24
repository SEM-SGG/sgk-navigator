// Versionsangaben in der Produktdokumentation (docs/sgk-navigator-dokumentation.html). Die Dokumentation nennt die Version
// im Titel «(v2026.11.18)», in Kopfzeile, Seitenkopf und Übersicht «Version 2026.11.18», «version 2026.11.18» (FR) bzw.
// «Versione 2026.11.18» (IT), in der Fusszeile «(Tag v2026.11.18)». scripts/check-dokumentation.mjs prüft, dass jede Stelle die Version aus CHANGELOG.md nennt;
// scripts/apply-fassungen.mjs setzt sie beim automatischen Einbau mit setDocVersion.
export const DOC_FILE = 'docs/sgk-navigator-dokumentation.html';

const PATTERN = /(\b[Vv]ersione? |\(v|\b[Tt]ag v)(\d{4}\.\d{2}\.\d{2}(?:-\d+)?)(?![\d.])/g;

/** Alle Versionsangaben: [{ line, version, text }] */
export function docVersions(html) {
  const out = [];
  String(html).split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(PATTERN)) {
      const from = Math.max(0, m.index - 40);
      out.push({ line: i + 1, version: m[2], text: l.slice(from, m.index + m[0].length + 30).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() });
    }
  });
  return out;
}

/** { ok, found, wrong: [{ line, version, text }] } */
export function checkDocVersion(html, version) {
  const found = docVersions(html);
  const wrong = found.filter((f) => f.version !== version);
  return { ok: found.length > 0 && wrong.length === 0, found: found.length, wrong };
}

export function setDocVersion(html, version) {
  if (!/^\d{4}\.\d{2}\.\d{2}(-\d+)?$/.test(version || '')) throw new Error(`Version «${version}» hat nicht die Form JJJJ.MM.TT.`);
  if (!docVersions(html).length) throw new Error(`${DOC_FILE}: keine Versionsangabe gefunden (erwartet «Version JJJJ.MM.TT» oder «(vJJJJ.MM.TT)»).`);
  return String(html).replace(PATTERN, (_, pre) => pre + version);
}

/** Deutsche Meldung für einen roten Lauf: Datei, Fundstellen, Behebung. */
export function docVersionMessage(result, version) {
  if (result.ok) return null;
  const fix = 'Behebung: Ein Agent führt «node scripts/check-dokumentation.mjs --fix» aus und committet die Datei (AGENTS.md, Abschnitt «Version und Changelog»). Die Datei ist zu gross für den Editor von GitHub im Browser.';
  if (!result.found) return `${DOC_FILE}: keine Versionsangabe gefunden. Erwartet ist «Version ${version}» in Kopfzeile und Seitenkopf und «(v${version})» im Titel.\n${fix}`;
  const lines = result.wrong.map((w) => `  Zeile ${w.line}: nennt ${w.version} statt ${version} («${w.text}»)`);
  return `${DOC_FILE}: Die Versionsangabe passt nicht zur Version in CHANGELOG.md (${version}).\n${lines.join('\n')}\n${fix}`;
}
