// Äquivalenz Upload ↔ zentraler Build im Browser (Parser von Chrome statt linkedom wie in test/app/equiv.test.mjs).
// Testvariante ohne die jüngste Fassung aller fünf Werke (global-setup: sgk-navigator-upload-all.html); Upload der 15 echten
// EUR-Lex-Dateien (DE, FR, EN je Werk) über die gemeinsame Ablage; Vergleich mit der vollständigen Version (dist/) je Werk und
// Sprache: Blöcke (Schlüssel, Typ, Text, Gliederungszeichen, Herkunft, Tiefe, Kennzeichen, Bild), Verweisindex (aus- und
// eingehend), geänderte Einheiten des Stands (Chronologie). Erklärbare Unterschiede: test/app/equiv/expected.mjs.
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const APP_ALL = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-upload-all.html');
const LIVE = (f) => join(ROOT, 'test/app/fixtures-live', f);
const FASSUNG = { sgk: '02016R0399-20251012', ees: '02017R2226-20260612', etias: '02018R1240-20260612', vis: '02008R0767-20260612', iop: '02019R0817-20260612' };
const FILES = Object.values(FASSUNG).flatMap((c) => ['DE', 'FR', 'EN'].map((l) => `${c}_${l}.html`));
// wie test/app/equiv/expected.mjs
const EXPLAINED_META = ['act', 'acts'];
const KNOWN = { iop: ['art_24'] };

async function open(page, url, hash = '') {
  const log = { errors: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  await page.goto(url + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}

/** Signatur des jüngsten Stands mit der Fassung celex (im Browser, mit den Funktionen der Anwendung). */
const signature = ({ id, celex }) => {
  const D = window.__sgk.work(id);
  const st = D.stages.filter((s) => s.source && s.source.celex === celex).sort((a, b) => b.order - a.order)[0];
  if (!st) return null;
  const out = { stage: { id: st.id, langs: st.langs, act: st.act, acts: st.acts || null, kind: st.source.kind }, langs: {} };
  for (const lang of D.langs) {
    const units = {};
    for (const u of D.unitOrder) {
      const v = D.version(u, lang, st.id);
      if (!v || v.repealed) continue;
      units[u] = { title: v.title || '', blocks: v.blocks.map((b) => [b.k, b.ty || '', b.t || b.html || '', b.l || '', b.o || '', b.d || 0, b.x || '', b.asset ?? null]) };
    }
    const ri = D.refIndex(lang, st.id);
    const tgt = (r) => (r.targets || [r.target]).map((x) => `${x.kind}:${x.unit || ''}#${x.key || ''}@${x.work || x.celex || ''}`).join(',');
    out.langs[lang] = {
      units,
      refsOut: Object.fromEntries(Object.entries(ri.out).map(([k, l]) => [k, l.map((r) => r.text + '>' + tgt(r))])),
      refsIn: Object.fromEntries(Object.entries(ri.in).map(([k, l]) => [k, l.map((e) => `${e.unit}#${e.key}>${e.targetKey}:${e.text}`).sort()])),
      changes: D.changes(st.id, lang).map((c) => `${c.unit}#${c.key}:${c.change}`).sort(),
    };
  }
  return out;
};

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function compare(id, A, B) {
  const known = new Set(KNOWN[id] || []);
  const diffs = [];
  for (const f of ['id', 'langs', 'kind', 'act', 'acts']) {
    if (JSON.stringify(A.stage[f]) !== JSON.stringify(B.stage[f]) && !EXPLAINED_META.includes(f)) diffs.push(`Stand.${f}: ${JSON.stringify(A.stage[f])} | ${JSON.stringify(B.stage[f])}`);
  }
  for (const lang of Object.keys(A.langs)) {
    const a = A.langs[lang], b = B.langs[lang];
    for (const u of new Set([...Object.keys(a.units), ...Object.keys(b.units)])) {
      if (known.has(u)) continue;
      const x = a.units[u], y = b.units[u];
      if (!x || !y) { diffs.push(`${lang} ${u}: nur ${x ? 'zentral' : 'Upload'}`); continue; }
      if (norm(x.title) !== norm(y.title)) diffs.push(`${lang} ${u}: Titel`);
      if (x.blocks.length !== y.blocks.length) { diffs.push(`${lang} ${u}: ${x.blocks.length} | ${y.blocks.length} Blöcke`); continue; }
      x.blocks.forEach((p, i) => {
        const q = y.blocks[i];
        const fields = ['k', 'ty', 't', 'l', 'o', 'd', 'x', 'asset'].filter((_, j) => (j === 2 || j === 3 ? norm(p[j]) !== norm(q[j]) : p[j] !== q[j]));
        if (fields.length) diffs.push(`${lang} ${u}#${p[0]}: ${fields.join(',')} (${fields.map((f) => { const j = ['k', 'ty', 't', 'l', 'o', 'd', 'x', 'asset'].indexOf(f); return `${String(p[j]).slice(0, 60)} | ${String(q[j]).slice(0, 60)}`; }).join('; ')})`);
      });
    }
    const unitOf = (k) => k.split('#')[0];
    for (const k of new Set([...Object.keys(a.refsOut), ...Object.keys(b.refsOut)])) if (!known.has(unitOf(k)) && JSON.stringify(a.refsOut[k]) !== JSON.stringify(b.refsOut[k])) diffs.push(`${lang} Verweise aus ${k}`);
    for (const k of new Set([...Object.keys(a.refsIn), ...Object.keys(b.refsIn)])) {
      const fl = (l) => (l || []).filter((e) => !known.has(e.split('#')[0]));
      if (JSON.stringify(fl(a.refsIn[k])) !== JSON.stringify(fl(b.refsIn[k]))) diffs.push(`${lang} Verweise auf ${k}`);
    }
    const ch = (l) => l.filter((c) => !known.has(c.split('#')[0]));
    if (JSON.stringify(ch(a.changes)) !== JSON.stringify(ch(b.changes))) diffs.push(`${lang} geänderte Blöcke des Stands: ${ch(a.changes).length} | ${ch(b.changes).length}`);
  }
  return diffs;
}

test('Äquivalenz im Browser: Upload der jüngsten Fassung von SGK, EES-VO, ETIAS-VO, VIS-VO, IO-VO in DE, FR, EN = vollständige Version', { tag: '@daten' }, async ({ browser }) => {
  test.setTimeout(600000);
  test.skip(!existsSync(APP_ALL.slice(7)), 'Testvariante fehlt');
  test.skip(FILES.some((f) => !existsSync(LIVE(f))), 'test/app/fixtures-live/ fehlt (node test/app/tools/fetch-eurlex.mjs …)');
  const ctxU = await browser.newContext();
  const pu = await ctxU.newPage();
  const logU = await open(pu, APP_ALL, '#/aktualisieren');
  const before = await pu.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.__sgk.work(id).stages.length])), Object.keys(FASSUNG));
  await pu.locator('#file-input-all').setInputFiles(FILES.map((f) => ({ name: f, mimeType: 'text/html', buffer: readFileSync(LIVE(f)) })));
  await expect(pu.locator('#all-log li')).toHaveCount(FILES.length, { timeout: 480000 });
  const bad = await pu.locator('#all-log li:not(.ok)').allInnerTexts();
  expect(bad).toEqual([]);
  const after = await pu.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.__sgk.work(id).stages.length])), Object.keys(FASSUNG));
  for (const id of Object.keys(FASSUNG)) expect(after[id], id).toBe(before[id] + 1);

  const ctxA = await browser.newContext();
  const pa = await ctxA.newPage();
  const logA = await open(pa, APP);
  const summary = [];
  for (const [id, celex] of Object.entries(FASSUNG)) {
    const A = await pa.evaluate(signature, { id, celex });
    const B = await pu.evaluate(signature, { id, celex });
    expect(A, id).not.toBeNull();
    expect(B, id).not.toBeNull();
    const d = compare(id, A, B);
    const nBlocks = Object.values(A.langs).reduce((n, l) => n + Object.values(l.units).reduce((m, u) => m + u.blocks.length, 0), 0);
    summary.push(`${id} ${celex}: ${nBlocks} Blöcke (DE+FR+EN), ${d.length} Abweichungen`);
    expect(d, `${id}:\n${d.slice(0, 30).join('\n')}`).toEqual([]);
  }
  console.log(summary.join('\n'));
  expect(logU.errors).toEqual([]);
  expect(logA.errors).toEqual([]);
  await ctxU.close();
  await ctxA.close();
});
