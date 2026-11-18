// Prüfskript Carbon (Abnahmekriterium 4): keine Farbe, kein Radius, kein Schatten ausserhalb des :root-Blocks.
// Aufruf: node test/app/carbon-audit.mjs  (Exit-Code 1 bei Befunden)
// Geprüft: src/app/styles.css und alle Modul-Stylesheets src/app/modules/*/*.css sowie Inline-Stile und Farbkonstanten in src/app/**/*.js.
// Erlaubt (begründet): Schlüsselwörter transparent/currentColor/inherit; border-radius 0 und 50 % (Kreise: Punkte, Knoten, Schrittnummern);
// box-shadow nur none, var(--shadow-overlay) oder Linien «inset … var(--token)» ohne Weichzeichnung (Rahmen und Balken nach bundle.css);
// Hex-Werte in JavaScript nur in src/app/tokens.js (Spiegel von tokens.css für Canvas, PDF und Word).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = join(ROOT, 'src/app');
const issues = [];
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const OLD = /var\(--(red|red-dark|red-50|slate-\d+|ink-2|muted|line|line-2|paper|panel|ins-bg|ins-ink|ins-line|del-bg|del-ink|del-line|ui|serif|sp-\d+|fs-[a-z0-9]+|ctl-h(?:-sm|-lg)?|head-h|toc-w|r-ctl|r-card|r-note|r-tag|shadow-card|shadow-pop)\)/;
const NAMED = /:\s*[^;]*\b(white|black|red|blue|green|gray|grey|yellow|orange|purple)\b/;

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const cssFiles = [join(APP, 'styles.css'), ...readdirSync(join(APP, 'modules')).flatMap((m) => { const d = join(APP, 'modules', m); return statSync(d).isDirectory() ? readdirSync(d).filter((f) => f.endsWith('.css')).map((f) => join(d, f)) : []; })];

const okShadow = (v) => {
  v = v.trim().replace(/\s*!important$/, '');
  if (v === 'none' || v === 'var(--shadow-overlay)') return true;
  // Liste von Linien: inset X Y [0 [spread]] var(--token)
  return v.split(/,(?![^(]*\))/).every((seg) => /^\s*inset\s+-?\d+(\.\d+)?(px)?\s+-?\d+(\.\d+)?(px)?(\s+0(px)?)?(\s+-?\d+(\.\d+)?px)?\s+var\(--[a-z0-9-]+\)\s*$/.test(seg) || seg.trim() === 'var(--shadow-overlay)' || /^\s*-?\d+(px)?\s+0\s+0\s+var\(--[a-z0-9-]+\)\s*$/.test(seg));
};
const okRadius = (v) => { v = v.trim(); return /^var\(--radius-(none|xs|sm)\)$/.test(v) || v === '0' || v === '50%'; };

for (const f of cssFiles) {
  const rel = relative(ROOT, f);
  let s = readFileSync(f, 'utf8');
  // Kommentare entfernen, Zeilen erhalten
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const lines = s.split('\n');
  let inRoot = false, depth = 0;
  lines.forEach((line, i) => {
    if (/^:root\s*\{/.test(line) || /^\s*:root\s*\{/.test(line) && depth === 0) { inRoot = true; }
    const t = line;
    if (!inRoot) {
      if (COLOR.test(t)) issues.push(`${rel}:${i + 1} Farbe ausserhalb :root: ${t.trim().slice(0, 140)}`);
      if (OLD.test(t)) issues.push(`${rel}:${i + 1} alte Variable: ${t.match(OLD)[0]}`);
      for (const m of t.matchAll(/border(?:-[a-z]+)?-radius\s*:\s*([^;}]+)/g)) if (!okRadius(m[1])) issues.push(`${rel}:${i + 1} Radius ohne Token: ${m[0]}`);
      for (const m of t.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) if (!okShadow(m[1])) issues.push(`${rel}:${i + 1} Schatten ohne Token: ${m[0].slice(0, 120)}`);
      for (const m of t.matchAll(/(?:^|[;{\s])(color|background(?:-color)?|border(?:-[a-z]+)?|outline|fill|stroke)\s*:\s*([^;}]+)/g)) if (/\b(white|black|grey|gray)\b/.test(m[2])) issues.push(`${rel}:${i + 1} Farbname: ${m[0].trim()}`);
    }
    if (inRoot && /^\}/.test(line)) inRoot = false;
  });
}

// JavaScript: Inline-Stile und Farbkonstanten
for (const f of walk(APP).filter((x) => x.endsWith('.js'))) {
  const rel = relative(ROOT, f);
  if (rel === 'src/app/tokens.js') continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\(/.test(code) && !/HEX\s*=|\\#|'#\/|"#\/|`#\/|#\/|href=|#print-root|'#main'|getElementById/.test(code)) issues.push(`${rel}:${i + 1} Farbwert in JS: ${code.trim().slice(0, 140)}`);
    if (/style=/.test(code) && /border-radius|box-shadow|borderRadius|boxShadow/.test(code)) issues.push(`${rel}:${i + 1} Radius/Schatten im Inline-Stil: ${code.trim().slice(0, 140)}`);
    if (OLD.test(code)) issues.push(`${rel}:${i + 1} alte Variable in JS: ${code.match(OLD)[0]}`);
  });
}

// tokens.js = tokens.css
const css = readFileSync(join(ROOT, 'design/carbon/tokens.css'), 'utf8');
const { CARBON } = await import(join(APP, 'tokens.js'));
for (const [, k, v] of css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) if ((CARBON[k] || '').toLowerCase() !== v.toLowerCase()) issues.push(`src/app/tokens.js: ${k} = ${CARBON[k]} statt ${v}`);
// :root in styles.css enthält alle Tokens aus tokens.css mit gleichem Wert
const st = readFileSync(join(APP, 'styles.css'), 'utf8');
const rootBlock = st.slice(st.indexOf(':root {'), st.indexOf('\n}\n', st.indexOf(':root {')));
// Ausnahme: die Schriftstapel enthalten nach der ersten Familie die eingebetteten Zeichenschriften «SGKN Zeichen» und «SGKN Symbole»
const unSym = (x) => x.replace('"SGKN Zeichen", "SGKN Symbole", ', '').trim();
for (const [, k, v] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) { const m = rootBlock.match(new RegExp(`--${k}:\\s*([^;]+);`)); if (!m || unSym(m[1]) !== v.trim()) issues.push(`styles.css :root: --${k} fehlt oder weicht ab`); }

console.log(issues.length ? issues.join('\n') : 'Carbon-Prüfung: keine Befunde (Farben, Radien, Schatten nur im :root-Block; keine alten Variablen).');
console.log(`Geprüft: ${cssFiles.map((f) => relative(ROOT, f)).join(', ')} und ${walk(APP).filter((x) => x.endsWith('.js')).length} JS-Dateien.`);
process.exit(issues.length ? 1 : 0);
