// SGK-Navigator — Export von Karten: Kartenmodell, Prüfung, Hilfen (ESM, isomorph, ohne Abhängigkeiten).
//
// Das Kartenmodell ist die einzige Schnittstelle zwischen Oberfläche und Export. Die Oberfläche füllt es fertig
// übersetzt; die Bibliothek enthält keine eigenen UI-Texte ausser Rückfallwerten (FALLBACK_LABELS).
// Ausführliche Beschreibung mit Beispielen: data/EXPORT_NOTES.md.

/**
 * Textlauf. Kleinste Einheit mit einheitlicher Formatierung.
 * @typedef {Object} Run
 * @property {string} t                 Text, unverändert aus dem Datensatz. "\n" = Zeilenumbruch innerhalb des Blocks.
 * @property {'eq'|'ins'|'del'} [op]    Redline: unverändert (Standard), eingefügt, gestrichen.
 * @property {boolean} [b]              fett
 * @property {boolean} [i]              kursiv
 * @property {boolean} [sup]            hochgestellt
 * @property {boolean} [sub]            tiefgestellt
 * @property {string} [lang]            Sprache dieses Laufs, falls abweichend (ISO 639-1, z. B. "fr")
 */

/**
 * Tabellenzelle in einem Tabellen-Block.
 * @typedef {Object} TableCell
 * @property {Run[]} runs
 * @property {number} [span]            Spalten verbinden (Standard 1)
 */

/**
 * Block = ein Absatz des Rechtstexts mit Gliederungszeichen.
 * @typedef {Object} Block
 * @property {'p'|'heading'|'table'|'img'} [type]  Standard "p". "heading": Zwischenüberschrift im Rechtstext (fett).
 *           "table": Tabelle aus einem Anhang (rows). "img": Bild, das nicht exportiert wird; runs = Ersatztext.
 * @property {string} [label]           Gliederungszeichen, hängend gesetzt: "(3)", "a)", "i)", "1.", "—"
 * @property {number} [depth]           Gliederungstiefe 0–8 (Standard 0); Einzug je Stufe
 * @property {Run[]} [runs]             Inhalt (Pflicht ausser bei "table")
 * @property {{cells: TableCell[], header?: boolean}[]} [rows]  nur "table"
 * @property {'eq'|'ins'|'del'} [op]    Block als Ganzes eingefügt oder gestrichen (sonst aus den Läufen abgeleitet)
 * @property {string} [lang]            Sprache des Blocks, falls abweichend
 * @property {string} [key]             Schlüssel im Datensatz (nur zur Nachverfolgung, wird nicht ausgegeben)
 */

/**
 * Kennzeichen eines Abschnitts (Statusetikett).
 * @typedef {Object} Flag
 * @property {'reconstructed'|'pending'|'not-applicable'|'preview'|'editorial'|'derogation'|'info'} kind
 * @property {string} label             fertig übersetzter Text, z. B. "rekonstruiert", "noch nicht anwendbar"
 */

/**
 * Abschnitt = ein Schritt der Chronologie, ein Stand oder eine Fassung.
 * @typedef {Object} Section
 * @property {string} heading           z. B. "VO (EU) 2017/458"
 * @property {string} [code]            Kurzkürzel des Akts, fett vor der Überschrift, z. B. "Syst. Abfr."
 * @property {string} [tag]             Art der Änderung, z. B. "ersetzt"
 * @property {string} [color]           Akzentfarbe "#RRGGBB" (Randmarke im PDF, Quadrat in Word/HTML)
 * @property {string[]} [meta]          Metazeile(n), mit " | " verbunden
 * @property {Flag[]} [flags]           Statusetiketten
 * @property {Block[]} blocks
 * @property {string} [lang]            Sprache des Rechtstexts dieses Abschnitts, falls abweichend
 */

/**
 * Herkunftsmarke in einer Vergleichszelle (z. B. Akt, der die Fassung eingefügt hat).
 * @typedef {Object} Mark
 * @property {string} label
 * @property {string} [color]
 */

/**
 * @typedef {Object} Cell
 * @property {Block[]} blocks           leer oder null = Zelle leer (Strich)
 * @property {Mark[]} [marks]
 */

/**
 * Zeile der Gegenüberstellung: links und rechts zeilenweise ausgerichtete Blöcke.
 * @typedef {Object} Row
 * @property {string} [label]           Fundstelle, z. B. "Abs. 3 Bst. a Ziff. i"
 * @property {string} [tag]             z. B. "geändert", "eingefügt"
 * @property {'same'|'changed'|'inserted'|'deleted'} [status]
 * @property {(Cell|null)[]} cells       genau zwei Zellen
 */

/**
 * @typedef {Object} Column
 * @property {string} heading
 * @property {string} [lang]            Sprache der Spalte (Sprachvergleich)
 * @property {number[]} [sectionIndexes] Vertrag SPEC3 §3.9: Abschnitte, die in dieser Spalte stehen (ohne rows)
 */

/**
 * @typedef {{op:'ins'|'del', label:string} | {code?:string, label:string, color?:string}} LegendItem
 */

/**
 * Karte.
 * @typedef {Object} Card
 * @property {'chronology'|'comparison'|'row'|'preview'} kind
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [unitLine]        dritte Kopfzeile, z. B. "Art. 8: Grenzübertrittskontrollen von Personen"
 * @property {string} [brand]           Kopfzeile links (nur PDF), z. B. "SGK-Navigator"
 * @property {string} [work]            Kopfzeile rechts (nur PDF), z. B. "Schengener Grenzkodex"
 * @property {string} textLang          Sprache des Rechtstexts ("de"|"fr"|"en"|…)
 * @property {string} uiLang            Sprache der Beschriftungen
 * @property {string} [textLocale]      Gebietsschema für Word (Standard: de→de-DE, fr→fr-FR, en→en-GB, EU-Rechtstext)
 * @property {string} [uiLocale]        Gebietsschema der Beschriftungen (Standard: de→de-CH, fr→fr-CH, en→en-GB)
 * @property {string} [stats]           Kennzahlenzeile über dem Inhalt, z. B. "1 geändert, 5 eingefügt, 0 gestrichen"
 * @property {Section[]} sections
 * @property {Column[]|null} [columns]  zwei Spalten = Gegenüberstellung nebeneinander
 * @property {Row[]} [rows]             zeilenweise ausgerichtete Gegenüberstellung (braucht columns)
 * @property {string} [labelHeading]    Kopf der Fundstellen-Spalte, z. B. "Bestimmung"
 * @property {LegendItem[]} [legend]
 * @property {{mark:string, text:string}[]} [footnotes]
 * @property {string} [source]          Quellenzeile
 * @property {string} [disclaimer]      Hinweis (z. B. «Massgebend ist allein das Amtsblatt …»)
 * @property {{page?:string, empty?:string, tracked?:string, pageOf?:string}} [labels]  Beschriftungen, sonst FALLBACK_LABELS
 */

export const OPS = ['eq', 'ins', 'del'];
export const KINDS = ['chronology', 'comparison', 'row', 'preview'];
export const BLOCK_TYPES = ['p', 'heading', 'table', 'img'];
export const FLAG_KINDS = ['reconstructed', 'pending', 'not-applicable', 'preview', 'editorial', 'derogation', 'info'];
export const ROW_STATUS = ['same', 'changed', 'inserted', 'deleted'];

/** Rückfallwerte für Beschriftungen, die die Bibliothek selbst setzt ({i}, {n} werden ersetzt). */
export const FALLBACK_LABELS = {
  de: { page: 'Seite {i} von {n}', empty: '—', tracked: 'Änderungen als Überarbeitungen erfasst (in Word annehmen oder ablehnen).', continued: '(Fortsetzung)' },
  fr: { page: 'Page {i} sur {n}', empty: '—', tracked: 'Modifications enregistrées comme révisions (à accepter ou refuser dans Word).', continued: '(suite)' },
  en: { page: 'Page {i} of {n}', empty: '—', tracked: 'Changes recorded as tracked changes (accept or reject in Word).', continued: '(continued)' },
};

const TEXT_LOCALE = { de: 'de-DE', fr: 'fr-FR', en: 'en-GB', it: 'it-IT', nl: 'nl-NL', es: 'es-ES', pt: 'pt-PT' };
const UI_LOCALE = { de: 'de-CH', fr: 'fr-CH', en: 'en-GB', it: 'it-CH' };

/** Gebietsschema des Rechtstexts. EU-Rechtstext: de-DE (mit «ß»), damit die Rechtschreibprüfung ihn nicht anstreicht. */
export const textLocale = (lang, card) => (card && card.textLocale && lang === card.textLang ? card.textLocale : TEXT_LOCALE[lang] || lang || 'de-DE');
export const uiLocale = (card) => (card.uiLocale || UI_LOCALE[card.uiLang] || card.uiLang || 'de-CH');

export function label(card, key, vars = {}) {
  const l = (card.labels && card.labels[key]) || (FALLBACK_LABELS[card.uiLang] || FALLBACK_LABELS.de)[key] || FALLBACK_LABELS.de[key] || '';
  return l.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

// ------------------------------------------------------------------ Prüfung

const isStr = (v) => typeof v === 'string';
const isColor = (v) => /^#[0-9a-fA-F]{6}$/.test(v);
const isLang = (v) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v);

/**
 * Prüft eine Karte. Wirft nicht.
 * @param {Card} card
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateCard(card) {
  const errors = [], warnings = [];
  const err = (p, m) => errors.push(`${p}: ${m}`);
  const warn = (p, m) => warnings.push(`${p}: ${m}`);
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { ok: false, errors: ['card: muss ein Objekt sein'], warnings };
  if (!KINDS.includes(card.kind)) err('kind', `unbekannter Wert ${JSON.stringify(card.kind)} (erlaubt: ${KINDS.join(', ')})`);
  if (!isStr(card.title) || !card.title.trim()) err('title', 'Pflichtfeld, nicht leerer Text');
  for (const f of ['subtitle', 'unitLine', 'brand', 'work', 'stats', 'source', 'disclaimer', 'labelHeading', 'textLocale', 'uiLocale']) {
    if (card[f] !== undefined && card[f] !== null && !isStr(card[f])) err(f, 'muss Text sein');
  }
  if (!isStr(card.textLang) || !isLang(card.textLang)) err('textLang', `Pflichtfeld, Sprachcode wie "de" (ist ${JSON.stringify(card.textLang)})`);
  if (!isStr(card.uiLang) || !isLang(card.uiLang)) err('uiLang', `Pflichtfeld, Sprachcode wie "de" (ist ${JSON.stringify(card.uiLang)})`);
  if (!Array.isArray(card.sections)) err('sections', 'Pflichtfeld, Liste (darf leer sein, wenn rows gesetzt ist)');

  const checkRuns = (runs, p) => {
    if (!Array.isArray(runs)) { err(p, 'muss eine Liste von Läufen sein'); return; }
    runs.forEach((r, i) => {
      const q = `${p}[${i}]`;
      if (!r || typeof r !== 'object') { err(q, 'Lauf muss ein Objekt sein'); return; }
      if (!isStr(r.t)) err(q + '.t', `muss Text sein (ist ${JSON.stringify(r.t)})`);
      else if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(r.t)) err(q + '.t', 'enthält Steuerzeichen');
      if (r.op !== undefined && !OPS.includes(r.op)) err(q + '.op', `unbekannter Wert ${JSON.stringify(r.op)} (erlaubt: ${OPS.join(', ')})`);
      for (const f of ['b', 'i', 'sup', 'sub']) if (r[f] !== undefined && typeof r[f] !== 'boolean') err(`${q}.${f}`, 'muss true/false sein');
      if (r.sup && r.sub) err(q, 'sup und sub schliessen sich aus');
      if (r.lang !== undefined && !isLang(r.lang)) err(q + '.lang', 'ungültiger Sprachcode');
      const extra = Object.keys(r).filter((k) => !['t', 'op', 'b', 'i', 'sup', 'sub', 'lang'].includes(k));
      if (extra.length) warn(q, `unbekannte Felder ignoriert: ${extra.join(', ')}`);
    });
  };
  const checkBlocks = (blocks, p) => {
    if (!Array.isArray(blocks)) { err(p, 'muss eine Liste von Blöcken sein'); return; }
    blocks.forEach((b, i) => {
      const q = `${p}[${i}]`;
      if (!b || typeof b !== 'object') { err(q, 'Block muss ein Objekt sein'); return; }
      const type = b.type || 'p';
      if (!BLOCK_TYPES.includes(type)) err(q + '.type', `unbekannter Wert ${JSON.stringify(b.type)} (erlaubt: ${BLOCK_TYPES.join(', ')})`);
      if (b.label !== undefined && b.label !== null && !isStr(b.label)) err(q + '.label', 'muss Text sein');
      if (b.depth !== undefined && !(Number.isInteger(b.depth) && b.depth >= 0 && b.depth <= 8)) err(q + '.depth', `ganze Zahl 0–8 (ist ${JSON.stringify(b.depth)})`);
      if (b.op !== undefined && !OPS.includes(b.op)) err(q + '.op', `unbekannter Wert ${JSON.stringify(b.op)}`);
      if (b.lang !== undefined && !isLang(b.lang)) err(q + '.lang', 'ungültiger Sprachcode');
      if (type === 'table') {
        if (!Array.isArray(b.rows) || !b.rows.length) err(q + '.rows', 'Tabellen-Block braucht rows');
        else b.rows.forEach((r, k) => {
          if (!r || !Array.isArray(r.cells) || !r.cells.length) { err(`${q}.rows[${k}].cells`, 'Liste von Zellen nötig'); return; }
          r.cells.forEach((c, m) => {
            if (!c || typeof c !== 'object') { err(`${q}.rows[${k}].cells[${m}]`, 'Zelle muss ein Objekt sein'); return; }
            checkRuns(c.runs, `${q}.rows[${k}].cells[${m}].runs`);
            if (c.span !== undefined && !(Number.isInteger(c.span) && c.span >= 1)) err(`${q}.rows[${k}].cells[${m}].span`, 'ganze Zahl ≥ 1');
          });
        });
      } else checkRuns(b.runs, q + '.runs');
    });
  };
  const checkMarks = (marks, p) => {
    if (marks === undefined || marks === null) return;
    if (!Array.isArray(marks)) { err(p, 'muss Liste sein'); return; }
    marks.forEach((m, i) => {
      if (!m || !isStr(m.label)) err(`${p}[${i}].label`, 'Pflichtfeld, Text');
      if (m && m.color !== undefined && !isColor(m.color)) err(`${p}[${i}].color`, 'Farbe als "#RRGGBB"');
    });
  };

  if (Array.isArray(card.sections)) card.sections.forEach((s, i) => {
    const p = `sections[${i}]`;
    if (!s || typeof s !== 'object') { err(p, 'Abschnitt muss ein Objekt sein'); return; }
    if (!isStr(s.heading)) err(p + '.heading', 'Pflichtfeld, Text (darf leer sein)');
    for (const f of ['code', 'tag']) if (s[f] !== undefined && s[f] !== null && !isStr(s[f])) err(`${p}.${f}`, 'muss Text sein');
    if (s.color !== undefined && s.color !== null && !isColor(s.color)) err(p + '.color', `Farbe als "#RRGGBB" (ist ${JSON.stringify(s.color)})`);
    if (s.meta !== undefined && !(Array.isArray(s.meta) && s.meta.every(isStr))) err(p + '.meta', 'Liste von Texten');
    if (s.lang !== undefined && !isLang(s.lang)) err(p + '.lang', 'ungültiger Sprachcode');
    if (s.flags !== undefined) {
      if (!Array.isArray(s.flags)) err(p + '.flags', 'Liste');
      else s.flags.forEach((f, k) => {
        if (!f || !FLAG_KINDS.includes(f.kind)) err(`${p}.flags[${k}].kind`, `unbekannter Wert ${JSON.stringify(f && f.kind)} (erlaubt: ${FLAG_KINDS.join(', ')})`);
        if (!f || !isStr(f.label) || !f.label) err(`${p}.flags[${k}].label`, 'Pflichtfeld, Text');
      });
    }
    checkBlocks(s.blocks, p + '.blocks');
  });

  const cols = card.columns;
  if (cols !== undefined && cols !== null) {
    if (!Array.isArray(cols) || cols.length !== 2) err('columns', 'null oder genau zwei Spalten');
    else cols.forEach((c, i) => {
      if (!c || !isStr(c.heading)) err(`columns[${i}].heading`, 'Pflichtfeld, Text');
      if (c && c.lang !== undefined && !isLang(c.lang)) err(`columns[${i}].lang`, 'ungültiger Sprachcode');
      if (c && c.sectionIndexes !== undefined) {
        if (!Array.isArray(c.sectionIndexes) || !c.sectionIndexes.every((x) => Number.isInteger(x) && Array.isArray(card.sections) && x >= 0 && x < card.sections.length)) err(`columns[${i}].sectionIndexes`, 'Liste gültiger Abschnittsnummern');
      }
    });
  }
  if (card.rows !== undefined && card.rows !== null) {
    if (!Array.isArray(card.rows)) err('rows', 'muss Liste sein');
    else {
      if (!Array.isArray(cols) || cols.length !== 2) err('rows', 'rows braucht columns mit zwei Spalten');
      card.rows.forEach((r, i) => {
        const p = `rows[${i}]`;
        if (!r || typeof r !== 'object') { err(p, 'Zeile muss ein Objekt sein'); return; }
        if (r.label !== undefined && r.label !== null && !isStr(r.label)) err(p + '.label', 'muss Text sein');
        if (r.tag !== undefined && r.tag !== null && !isStr(r.tag)) err(p + '.tag', 'muss Text sein');
        if (r.status !== undefined && !ROW_STATUS.includes(r.status)) err(p + '.status', `unbekannter Wert ${JSON.stringify(r.status)}`);
        if (!Array.isArray(r.cells) || r.cells.length !== 2) { err(p + '.cells', 'genau zwei Zellen (null = leer)'); return; }
        r.cells.forEach((c, k) => {
          if (c === null) return;
          if (typeof c !== 'object') { err(`${p}.cells[${k}]`, 'Objekt oder null'); return; }
          checkBlocks(c.blocks || [], `${p}.cells[${k}].blocks`);
          checkMarks(c.marks, `${p}.cells[${k}].marks`);
        });
      });
    }
  }
  if (card.legend !== undefined && card.legend !== null) {
    if (!Array.isArray(card.legend)) err('legend', 'muss Liste sein');
    else card.legend.forEach((l, i) => {
      if (!l || !isStr(l.label)) err(`legend[${i}].label`, 'Pflichtfeld, Text');
      if (l && l.op !== undefined && !['ins', 'del'].includes(l.op)) err(`legend[${i}].op`, 'nur "ins" oder "del"');
      if (l && l.color !== undefined && !isColor(l.color)) err(`legend[${i}].color`, 'Farbe als "#RRGGBB"');
    });
  }
  if (card.footnotes !== undefined && card.footnotes !== null) {
    if (!Array.isArray(card.footnotes)) err('footnotes', 'muss Liste sein');
    else card.footnotes.forEach((f, i) => { if (!f || !isStr(f.mark) || !isStr(f.text)) err(`footnotes[${i}]`, '{ mark, text } als Texte'); });
  }
  if (card.labels !== undefined && (typeof card.labels !== 'object' || card.labels === null)) err('labels', 'muss Objekt sein');
  const hasContent = (Array.isArray(card.sections) && card.sections.length) || (Array.isArray(card.rows) && card.rows.length);
  if (!hasContent && !errors.length) warn('card', 'weder sections noch rows enthalten Inhalt');
  return { ok: errors.length === 0, errors, warnings };
}

/** Wirft einen Fehler mit allen Meldungen, wenn die Karte ungültig ist. */
export function assertCard(card, i = null) {
  const r = validateCard(card);
  if (!r.ok) {
    const e = new Error(`Ungültige Karte${i !== null ? ' #' + (i + 1) : ''}: ${r.errors.slice(0, 8).join('; ')}${r.errors.length > 8 ? ` (+${r.errors.length - 8} weitere)` : ''}`);
    e.errors = r.errors;
    throw e;
  }
  return r;
}

// ------------------------------------------------------------------ Normalisieren

const normRun = (r) => ({ t: r.t, op: r.op || 'eq', b: !!r.b, i: !!r.i, sup: !!r.sup, sub: !!r.sub && !r.sup, lang: r.lang || null });

/** Ganzer Block eingefügt/gestrichen? (nur aus Läufen mit sichtbarem Text) */
export function blockOp(b) {
  if (b.op) return b.op;
  const runs = b.type === 'table' ? (b.rows || []).flatMap((r) => r.cells.flatMap((c) => c.runs || [])) : b.runs || [];
  const vis = runs.filter((r) => /\S/.test(r.t));
  if (!vis.length) return 'eq';
  if (vis.every((r) => r.op === 'ins')) return 'ins';
  if (vis.every((r) => r.op === 'del')) return 'del';
  return 'eq';
}

function normBlock(b, lang) {
  const type = b.type || 'p';
  const out = { type, label: b.label || '', depth: b.depth || 0, lang: b.lang || lang, key: b.key || null };
  if (type === 'table') out.rows = b.rows.map((r) => ({ header: !!r.header, cells: r.cells.map((c) => ({ span: c.span || 1, runs: (c.runs || []).map(normRun) })) }));
  else out.runs = (b.runs || []).map(normRun);
  out.op = b.op || blockOp(out);
  return out;
}

/**
 * Normalisierte Kopie: Standardwerte gesetzt, Sprache je Block aufgelöst, columns.sectionIndexes in rows überführt.
 * @param {Card} card
 */
export function normalizeCard(card) {
  const tl = card.textLang;
  const sections = (card.sections || []).map((s) => ({
    heading: s.heading || '', code: s.code || '', tag: s.tag || '', color: s.color || null, meta: (s.meta || []).filter(Boolean),
    flags: s.flags || [], lang: s.lang || tl, blocks: (s.blocks || []).map((b) => normBlock(b, s.lang || tl)),
  }));
  let columns = card.columns && card.columns.length === 2 ? card.columns.map((c) => ({ heading: c.heading, lang: c.lang || tl, sectionIndexes: c.sectionIndexes || null })) : null;
  let rows = null;
  const inColumns = new Set();
  if (columns) {
    if (Array.isArray(card.rows)) {
      rows = card.rows.map((r) => ({
        label: r.label || '', tag: r.tag || '', status: r.status || null,
        cells: r.cells.map((c, k) => (c && c.blocks && c.blocks.length ? { blocks: c.blocks.map((b) => normBlock(b, columns[k].lang)), marks: c.marks || [] } : null)),
      }));
    } else if (columns.some((c) => c.sectionIndexes)) {
      // Vertrag SPEC3 §3.9: Abschnitte als Spalteninhalt (eine Zeile, nicht blockweise ausgerichtet)
      const cell = (c) => {
        const idx = c.sectionIndexes || [];
        idx.forEach((x) => inColumns.add(x));
        const blocks = [];
        const marks = [];
        for (const x of idx) {
          const s = sections[x];
          if (!s) continue;
          blocks.push(...s.blocks);
          if (s.code || s.heading) marks.push({ label: [s.code, s.heading].filter(Boolean).join(' '), color: s.color || undefined });
        }
        return blocks.length ? { blocks, marks } : null;
      };
      rows = [{ label: '', tag: '', status: null, cells: columns.map(cell) }];
    } else rows = [];
  }
  return {
    kind: card.kind, title: card.title, subtitle: card.subtitle || '', unitLine: card.unitLine || '', brand: card.brand || '', work: card.work || '',
    textLang: tl, uiLang: card.uiLang, textLocale: card.textLocale || null, uiLocale: card.uiLocale || null, stats: card.stats || '',
    sections: sections.filter((_, i) => !inColumns.has(i)), columns, rows, labelHeading: card.labelHeading || '',
    legend: card.legend || [], footnotes: card.footnotes || [], source: card.source || '', disclaimer: card.disclaimer || '', labels: card.labels || {},
  };
}

// ------------------------------------------------------------------ Hilfen für Oberfläche und Tests

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '­', ndash: '–', mdash: '—', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', thinsp: ' ', nnbsp: ' ' };
export const decodeEntities = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

/**
 * Inline-HTML der Oberfläche (Wort-Diff: ins, del; Auszeichnung: b, strong, i, em, sup, sub, br) in Läufe umsetzen.
 * Andere Tags werden ignoriert, ihr Text bleibt erhalten. Gleich formatierte Nachbarn werden zusammengelegt.
 * @param {string} html
 * @returns {Run[]}
 */
export function htmlToRuns(html) {
  const out = [];
  const stack = [];
  const push = (t) => {
    if (!t) return;
    const f = { op: 'eq', b: false, i: false, sup: false, sub: false };
    for (const n of stack) {
      if (n === 'ins') f.op = 'ins';
      else if (n === 'del') f.op = 'del';
      else if (n === 'b' || n === 'strong') f.b = true;
      else if (n === 'i' || n === 'em') f.i = true;
      else if (n === 'sup') { f.sup = true; f.sub = false; } else if (n === 'sub') { f.sub = true; f.sup = false; }
    }
    const last = out[out.length - 1];
    if (last && last.op === f.op && last.b === f.b && last.i === f.i && last.sup === f.sup && last.sub === f.sub) last.t += t;
    else out.push({ t, ...f });
  };
  for (const part of String(html || '').split(/(<[^>]*>)/)) {
    if (!part) continue;
    if (part[0] === '<') {
      const m = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(part);
      if (!m) continue;
      const name = m[2].toLowerCase();
      if (name === 'br') { push('\n'); continue; }
      if (/\/\s*>$/.test(part)) continue;
      if (m[1]) { const k = stack.lastIndexOf(name); if (k >= 0) stack.splice(k, 1); } else stack.push(name);
      continue;
    }
    push(decodeEntities(part));
  }
  // Standardfelder knapp halten
  return out.map((r) => {
    const o = { t: r.t };
    if (r.op !== 'eq') o.op = r.op;
    for (const k of ['b', 'i', 'sup', 'sub']) if (r[k]) o[k] = true;
    return o;
  });
}

/**
 * Tabelle des Datensatzes (Block mit ty "table", Feld html: <table><tr><td><p>…</p></td>…) in einen Tabellen-Block umsetzen.
 * Absätze in einer Zelle werden durch Zeilenumbruch ("\n") getrennt; <th> und Zeilen in <thead> gelten als Kopfzeile.
 * @param {string} html
 * @param {{ label?: string, depth?: number, key?: string }} [o]
 * @returns {Block}
 */
export function htmlTableToBlock(html, o = {}) {
  const rows = [];
  const src = String(html || '');
  const headEnd = src.search(/<\/thead>/i);
  for (const tr of src.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    let header = headEnd >= 0 && tr.index < headEnd;
    for (const td of tr[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      if (td[1].toLowerCase() === 'th') header = true;
      const span = +((/colspan\s*=\s*"?(\d+)/i.exec(td[2]) || [])[1] || 1);
      const inner = td[3].replace(/<\/p>\s*<p\b[^>]*>/gi, '<br>').replace(/<\/?p\b[^>]*>/gi, '');
      const runs = htmlToRuns(inner);
      const cell = { runs };
      if (span > 1) cell.span = span;
      cells.push(cell);
    }
    if (cells.length) rows.push(header ? { header: true, cells } : { cells });
  }
  const b = { type: 'table', rows };
  if (o.label) b.label = o.label;
  if (o.depth) b.depth = o.depth;
  if (o.key) b.key = o.key;
  return b;
}

/**
 * Text einer Läufe-Liste in einer Lesart.
 * @param {Run[]} runs
 * @param {'new'|'old'|'all'} which  new: ohne gestrichene, old: ohne eingefügte, all: alles
 */
export function runsText(runs, which = 'all') {
  let s = '';
  for (const r of runs || []) {
    const op = r.op || 'eq';
    if (which === 'new' && op === 'del') continue;
    if (which === 'old' && op === 'ins') continue;
    s += r.t;
  }
  return s;
}

const sameFmt = (a, b) => a.op === b.op && !!a.b === !!b.b && !!a.i === !!b.i && !!a.sup === !!b.sup && !!a.sub === !!b.sub && (a.lang || null) === (b.lang || null);

/** Benachbarte Läufe mit gleicher Formatierung zusammenlegen. */
export function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && sameFmt(last, r)) last.t += r.t; else out.push({ ...r });
  }
  return out;
}

/**
 * Vollständige Redline aus linker (eq|del) und rechter (eq|ins) Fassung desselben Diffs zusammensetzen.
 * Gestrichenes steht vor Eingefügtem. Liefert null, wenn der unveränderte Text beider Seiten nicht übereinstimmt.
 * @param {Run[]} left
 * @param {Run[]} right
 * @returns {Run[]|null}
 */
export function mergeRedline(left, right) {
  const chars = (runs, keep) => {
    const out = [];
    for (const r of runs) {
      const op = r.op || 'eq';
      for (const ch of r.t) out.push({ ch, op: op === keep ? op : op === 'eq' ? 'eq' : 'x', r });
    }
    return out;
  };
  const L = chars(left, 'del');
  const R = chars(right, 'ins');
  if (L.some((c) => c.op === 'x') || R.some((c) => c.op === 'x')) return null;
  const out = [];
  const emit = (c) => out.push({ ...c.r, t: c.ch, op: c.op });
  let i = 0, j = 0;
  while (i < L.length || j < R.length) {
    while (i < L.length && L[i].op === 'del') emit(L[i++]);
    while (j < R.length && R[j].op === 'ins') emit(R[j++]);
    if (i < L.length && j < R.length) {
      if (L[i].ch === R[j].ch) { emit(R[j]); i++; j++; continue; }
      // Leerraum, der nur auf einer Seite steht (Diff-Artefakt): als gestrichen bzw. eingefügt führen,
      // damit «alle annehmen» genau die neue und «alle ablehnen» genau die alte Fassung ergibt
      if (/\s/.test(L[i].ch)) { out.push({ ...L[i].r, t: L[i].ch, op: 'del' }); i++; continue; }
      if (/\s/.test(R[j].ch)) { out.push({ ...R[j].r, t: R[j].ch, op: 'ins' }); j++; continue; }
      return null;
    } else if (i < L.length || j < R.length) {
      // Rest: nur Leerraum darf noch übrig sein (gestrichene/eingefügte Zeichen sind oben schon ausgegeben)
      if (i < L.length) { if (!/\s/.test(L[i].ch)) return null; out.push({ ...L[i].r, t: L[i].ch, op: 'del' }); i++; }
      else { if (!/\s/.test(R[j].ch)) return null; out.push({ ...R[j].r, t: R[j].ch, op: 'ins' }); j++; }
    }
  }
  return mergeRuns(out);
}

/** Fliesstext eines Blocks (Lesart which), mit Gliederungszeichen, für Tests und reinen Text. */
export function blockText(b, which = 'new') {
  if (b.type === 'table') return b.rows.map((r) => r.cells.map((c) => runsText(c.runs, which)).join('\t')).join('\n');
  return runsText(b.runs, which);
}

/**
 * Redline-Läufe aus den beiden Seiten eines Wort-Diffs der Oberfläche (diffText: oldHtml mit <del>, newHtml mit <ins>).
 * Ergebnis: «alle annehmen» = neue Fassung, «alle ablehnen» = alte Fassung, zeichengenau.
 * Rückfall, falls sich die Seiten nicht zusammensetzen lassen: htmlToRuns(redlineHtml).
 * @param {string} oldHtml
 * @param {string} newHtml
 * @param {string} [redlineHtml]
 * @returns {Run[]}
 */
export function redlineRuns(oldHtml, newHtml, redlineHtml) {
  const m = mergeRedline(htmlToRuns(oldHtml), htmlToRuns(newHtml));
  if (m) return m.map((r) => { const o = { t: r.t }; if (r.op && r.op !== 'eq') o.op = r.op; for (const k of ['b', 'i', 'sup', 'sub']) if (r[k]) o[k] = true; return o; });
  return htmlToRuns(redlineHtml !== undefined ? redlineHtml : newHtml);
}

/**
 * Einzüge einer Blockfolge (Abschnitt oder Zelle), gemeinsam für Word, PDF und HTML.
 * Block mit Gliederungszeichen: Zeichen am Textanfang der übergeordneten Stufe, Text hängend dahinter.
 * Block ohne Zeichen (Unterabsatz): bündig mit dem Text der übergeordneten Stufe.
 * @param {{label:string, depth:number}[]} blocks
 * @param {{ step:number, hang:(label:string)=>number }} m   step: Einzug je Stufe ohne bekannte Elternstufe; hang: Breite für ein Zeichen
 * @returns {{ left:number, hang:number }[]}   left = Textanfang der Folgezeilen, hang = Breite des Zeichens (0 = ohne)
 */
export function blockIndents(blocks, m) {
  const textLeft = [];   // Textanfang je Tiefe (zuletzt gesehen)
  return blocks.map((b) => {
    const d = b.depth || 0;
    textLeft.length = Math.min(textLeft.length, d + 1);
    const base = d === 0 ? 0 : textLeft[d - 1] !== undefined ? textLeft[d - 1] : d * m.step;
    if (b.label) {
      const h = Math.max(m.step, m.hang(b.label));
      textLeft[d] = base + h;
      return { left: base + h, hang: h };
    }
    if (textLeft[d] === undefined) textLeft[d] = base;
    return { left: base, hang: 0 };
  });
}
