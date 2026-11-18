// PDF: durchsuchbarer Text vollständig und in Lesereihenfolge, Sonderzeichen, Seitengeometrie, Formate, Schriften.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cardToPdf, cardsToPdf } from '../../src/export/index.js';
import { fixtures, cardText, segmentCoverage, coverage, pdftotext, pdfPages, pdfGeometry, renderPages, pdfToUnicodeChars, has, OUT } from './lib.mjs';

const FX = fixtures();
const DIR = join(OUT, 'pdf');
mkdirSync(DIR, { recursive: true });
const POPPLER = has('pdftotext') && has('pdfinfo');

const made = [];
for (const { name, card } of FX) for (const format of ['a4', '16x9']) {
  const warnings = [];
  const t0 = performance.now();
  const bytes = cardToPdf(card, { format, date: '2026-11-12', onWarning: (w) => warnings.push(w) });
  const ms = performance.now() - t0;
  const f = join(DIR, `${name}.${format}.pdf`);
  writeFileSync(f, bytes);
  made.push({ name, card, format, bytes, f, warnings, ms });
}

test('PDF: Kopf, gleiche Eingabe gleiche Bytes, keine Ersatzzeichen-Warnungen', () => {
  for (const m of made) {
    assert.equal(String.fromCharCode(...m.bytes.subarray(0, 5)), '%PDF-');
    assert.deepEqual(m.warnings, [], `${m.name}.${m.format}: ${m.warnings.join('; ')}`);
    assert.deepEqual(cardToPdf(m.card, { format: m.format, date: '2026-11-12' }), m.bytes, `${m.name}.${m.format}: nicht reproduzierbar`);
  }
});

test('PDF: vollständiger Kartentext in richtiger Reihenfolge (pdftotext)', { skip: !POPPLER && 'poppler fehlt' }, () => {
  const report = [];
  for (const m of made) {
    const txt = pdftotext(m.f);
    writeFileSync(m.f.replace(/\.pdf$/, '.txt'), txt);
    const segs = cardText(m.card, 'all', { segments: true });
    const seg = segmentCoverage(segs, txt);
    const glob = coverage(segs.join('\n'), txt);
    const pages = pdfPages(m.f);
    report.push(`${m.name}.${m.format} [${m.card.textLang}]: ${pages} S., ${glob.words} Wörter, Abdeckung ${(glob.anyOrder * 100).toFixed(2)} %, in Reihenfolge gesamt ${(glob.ordered * 100).toFixed(2)} %, je Absatz ${(seg.ordered * 100).toFixed(2)} %, ${m.ms.toFixed(0)} ms`);
    assert.equal(glob.anyOrder, 1, `${m.name}.${m.format}: fehlend ${glob.missing.slice(0, 12).join(' ')}`);
    assert.equal(seg.ordered, 1, `${m.name}.${m.format}: Reihenfolge gestört in ${seg.bad.slice(0, 3).join(' | ')}`);
    // Gegenüberstellung: eine über den Seitenumbruch geteilte Zeile setzt links und rechts auf der Folgeseite fort,
    // die Gesamtreihenfolge ist dort nicht linear; massgebend ist die Reihenfolge je Absatz/Zelle
    if (!m.card.columns) assert.ok(glob.ordered >= 0.995, `${m.name}.${m.format}: Gesamtreihenfolge ${glob.ordered}`);
    assert.ok(glob.words >= seg.words);
  }
  writeFileSync(join(DIR, 'coverage.txt'), report.join('\n') + '\n');
});

test('PDF: Seitenformat, mehrseitige Karten, Seitenzahlen, eingebettete Schriften', { skip: !POPPLER && 'poppler fehlt' }, () => {
  for (const m of made) {
    const info = execFileSync('pdfinfo', [m.f], { encoding: 'utf8' });
    if (m.format === 'a4') assert.match(info, /Page size:\s+595\.28 x 841\.89/, m.name);
    else assert.match(info, /Page size:\s+960 x 540/, m.name);
    const fonts = execFileSync('pdffonts', [m.f], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean);
    assert.ok(fonts.length >= 2, `${m.name}: Schriften ${fonts.length}`);
    for (const l of fonts) assert.match(l, /SGKN(Serif|Sans)\S*\s+CID TrueType\s+Identity-H\s+yes\s+(yes|no)\s+yes/, `${m.name}: ${l}`);
  }
  const long = made.filter((m) => m.name === 'comparison-art8-s00-s08' || m.name === 'long-art8-unit');
  for (const m of long) {
    const n = pdfPages(m.f);
    assert.ok(n >= 4, `${m.name}.${m.format}: nur ${n} Seiten`);
    const txt = pdftotext(m.f);
    assert.ok(txt.includes(`Seite ${n} von ${n}`), `${m.name}.${m.format}: Seitenzahl fehlt`);
  }
});

test('PDF: keine Zeile ausserhalb der Seite, keine überlappenden Wörter', { skip: !POPPLER && 'poppler fehlt' }, () => {
  const report = [];
  for (const m of made) {
    const g = pdfGeometry(m.f, { margin: 12 });
    report.push(`${m.name}.${m.format}: ${g.pages} S., ${g.words} Wörter, ausserhalb ${g.outside.length}, Überlappungen ${g.overlaps.length}`);
    assert.deepEqual(g.outside, [], `${m.name}.${m.format}: ausserhalb`);
    assert.deepEqual(g.overlaps.slice(0, 5), [], `${m.name}.${m.format}: Überlappungen`);
  }
  writeFileSync(join(DIR, 'geometry.txt'), report.join('\n') + '\n');
});

// Sonderzeichen des Rechtstexts: jedes Zeichen muss als dasselbe Zeichen aus dem PDF kommen
const SPECIAL = [
  ['de', 'Straße, Maßnahme, Außengrenze „Anführung“ ‚einfach‘ – Gedankenstrich — Geviert, Schengen\u2011Raum (geschützter Bindestrich), 10\u00A0000 Personen (geschütztes Leerzeichen), 5\u202F% Anteil (schmales geschütztes Leerzeichen), ≥ 18 Jahre, ≤ 90 Tage, ½ Tag, § 3, Nr. 1¹ ² ³ ⁴, 2 × 3, 10 €, ° …'],
  ['fr', 'œuvre, Œuvre, cœur, «\u00A0guillemets\u00A0», l’article, à côté, Ça, élève, Île, maïs, naïf, Noël, Ærø, 1er alinéa, n° 2, 3 ½ jours, ≥ 10, ≤ 5'],
  ['en', 'third-country nationals’ “travel” ‘document’ – en dash — em dash, cross\u2011border, 1st, 2nd, ≥ 18, ½, café, naïve, résumé, £ 5, ® ™'],
];
const specialCard = () => ({
  kind: 'chronology', title: 'Sonderzeichen: ß œ Œ é „ “ « » ’ – ‑ ≥ ½ ¹', subtitle: 'Prüfkarte', textLang: 'de', uiLang: 'de',
  sections: SPECIAL.map(([l, t]) => ({ heading: l.toUpperCase(), lang: l, blocks: [
    { label: 'a)', runs: [{ t }] },
    { label: 'b)', runs: [{ t: 'Hochgestellt: Art. 8' }, { t: '1', sup: true }, { t: ' und tiefgestellt: H' }, { t: '2', sub: true }, { t: 'O; ' }, { t: 'eingefügt «neu»', op: 'ins' }, { t: ' ' }, { t: 'gestrichen „alt“', op: 'del' }] },
  ] })),
});

test('PDF: Sonderzeichen DE/FR/EN unverändert extrahierbar (A4 und 16:9)', { skip: !POPPLER && 'poppler fehlt' }, () => {
  const card = specialCard();
  const lines = [];
  for (const format of ['a4', '16x9']) {
    const warnings = [];
    const f = join(DIR, `sonderzeichen.${format}.pdf`);
    writeFileSync(f, cardToPdf(card, { format, date: '2026-11-12', onWarning: (w) => warnings.push(w) }));
    assert.deepEqual(warnings, []);
    const txt = pdftotext(f, false);
    const raw = pdftotext(f, true);
    const chars = new Set([...SPECIAL.map((s) => s[1]).join('') + card.title].filter((c) => c.codePointAt(0) > 126));
    // 1. Abbildung Glyphe -> Unicode im PDF (massgebend für Kopieren und Suchen in Acrobat/Browser)
    const mapped = has('qpdf') ? pdfToUnicodeChars(f) : null;
    const unmapped = mapped ? [...chars].filter((c) => !mapped.has(c)) : [];
    // 2. pdftotext; Poppler gibt U+00A0 als Leerzeichen aus und lässt U+202F/U+2009 weg (eigene Normalisierung)
    const WS = new Set(['\u00A0', '\u202F', '\u2009']);
    const bad = [...chars].filter((c) => !WS.has(c) && !raw.includes(c) && !txt.includes(c));
    const hex = (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    lines.push(`${format}: ${chars.size} Nicht-ASCII-Zeichen; in ToUnicode fehlend: ${unmapped.map(hex).join(' ') || 'keine'}; in pdftotext fehlend (ohne Leerräume): ${bad.map(hex).join(' ') || 'keine'}`);
    assert.deepEqual(unmapped.map(hex), [], format + ' ToUnicode');
    assert.deepEqual(bad.map(hex), [], format + ' pdftotext');
    assert.ok(raw.includes('10 000 Personen'), 'geschütztes Leerzeichen als Leerraum');
    // Wörter in Reihenfolge, je Sprache
    for (const [l, t] of SPECIAL) {
      const c = coverage(t.replace(/[\u202F\u2009]/g, ''), raw);   // Poppler lässt schmale Leerräume weg
      assert.equal(c.ordered, 1, `${format} ${l}: ${c.missing.join(' ')}`);
    }
    assert.ok(/Art\. 8\s?1\s+und tiefgestellt: H\s?2\s?O/.test(raw), `${format}: Hoch-/Tiefstellung`);
  }
  writeFileSync(join(DIR, 'sonderzeichen.txt'), lines.join('\n') + '\n');
});

test('PDF: Sammelkorb, Seitenzahlen fortlaufend', { skip: !POPPLER && 'poppler fehlt' }, () => {
  const f = join(DIR, 'sammelkorb.a4.pdf');
  writeFileSync(f, cardsToPdf(FX.map((x) => x.card), { format: 'a4', date: '2026-11-12' }));
  const n = pdfPages(f);
  const txt = pdftotext(f);
  assert.ok(txt.includes(`Page 1 sur ${n}`) || txt.includes(`Seite 1 von ${n}`) || txt.includes(`Page 1 of ${n}`));
  for (const { card } of FX) assert.ok(txt.includes(card.title.split(' ')[0]));
});

test('PDF: Seiten rendern (zur Durchsicht)', { skip: !has('pdftoppm') && 'pdftoppm fehlt' }, () => {
  const dir = join(DIR, 'png');
  mkdirSync(dir, { recursive: true });
  for (const m of made) assert.ok(renderPages(m.f, join(dir, `${m.name}.${m.format}`), 60).length >= 1);
  for (const format of ['a4', '16x9']) renderPages(join(DIR, `sonderzeichen.${format}.pdf`), join(dir, `sonderzeichen.${format}`), 110);
});

test('Zeichenvorrat: jedes Zeichen der Datensätze (SGK und data/works/*) ist in den eingebetteten Schriften', async () => {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');
  const { loadFont } = await import('../../src/export/fonts.js');
  const { htmlToRuns, runsText } = await import('../../src/export/model.js');
  const files = [join(OUT, '..', '..', '..', 'data', 'dataset.json')];
  const wd = join(OUT, '..', '..', '..', 'data', 'works');
  if (existsSync(wd)) for (const f of readdirSync(wd)) if (f.endsWith('.dataset.json')) files.push(join(wd, f));
  const chars = new Map();
  for (const f of files) {
    const ds = JSON.parse(readFileSync(f, 'utf8'));
    for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) for (const v of vs) {
      for (const s of [v.title || '', ...(v.blocks || []).flatMap((b) => [b.l || '', runsText(htmlToRuns(b.t || ''))])]) for (const c of s) if (c.codePointAt(0) > 126) chars.set(c, (chars.get(c) || 0) + 1);
    }
  }
  const lines = [];
  for (const key of ['serif-regular', 'serif-italic', 'serif-bold']) {
    const cps = loadFont(key).cps, sans = loadFont(key === 'serif-bold' ? 'sans-bold' : 'sans-regular').cps;
    const serifMiss = [...chars.keys()].filter((c) => !cps.has(c.codePointAt(0)) && !/\s/.test(c));
    if (serifMiss.length) lines.push(`${key}: nur in SGKN Sans (Rückfall): ${serifMiss.join(' ')}`);
    const miss = serifMiss.filter((c) => !sans.has(c.codePointAt(0)));
    lines.push(`${key}: ${chars.size} verschiedene Nicht-ASCII-Zeichen in ${files.length} Datensätzen, fehlend: ${miss.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ') || 'keine'}`);
    assert.deepEqual(miss, [], key);
  }
  writeFileSync(join(DIR, 'zeichenvorrat.txt'), lines.join('\n') + '\n');
});
