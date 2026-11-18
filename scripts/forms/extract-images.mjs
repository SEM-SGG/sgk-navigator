// Bild-Blöcke des Datensatzes ermitteln, Bilder aus data/assets.json und (Originalauflösung) aus raw/ dekodieren,
// verborgenen EUR-Lex-"Text von Bild" mitnehmen. Ausgabe: scripts/forms/work/ (Arbeitsordner, nicht versioniert).
// Aufruf: node scripts/forms/extract-images.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { hashString } from '../../src/core/text.js';
import { getVersion } from '../../src/core/model.js';
const require = createRequire(import.meta.url);
let sharp; try { sharp = require('sharp'); } catch { sharp = require('/opt/npm-tools/node_modules/sharp'); }

const ROOT = new URL('../../', import.meta.url).pathname;
const W = ROOT + 'scripts/forms/work/';
for (const d of ['asset', 'orig']) mkdirSync(W + d, { recursive: true });
const ds = JSON.parse(readFileSync(ROOT + 'data/dataset.json', 'utf8'));
const assets = JSON.parse(readFileSync(ROOT + 'data/assets.json', 'utf8'));
const LANGS = ['de', 'fr', 'en'];

// 1. Bild-Blöcke und Stände, in denen sie gelten
const occ = new Map(); // key unit|k|lang|asset -> { stages }
for (const [uid, u] of Object.entries(ds.units)) for (const lang of LANGS) for (const st of ds.stages) {
  if (!st.langs.includes(lang)) continue;
  const v = getVersion(ds, uid, lang, st.id);
  if (!v) continue;
  for (const b of v.blocks) if (b.ty === 'img') {
    const k = `${uid}|${b.k}|${lang}|${b.asset}`;
    if (!occ.has(k)) occ.set(k, { unit: uid, key: b.k, lang, asset: b.asset, o: b.o, alt: b.t || '', stages: [] });
    occ.get(k).stages.push(st.id);
  }
}

// 2. Bilder und Bildtexte in den Rohdateien
const RAW = ['32016R0399', '02016R0399-20240710', '02016R0399-20251012', '32017R2225', '32024R1717'];
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#xA;/g, ' ').replace(/\s+/g, ' ').trim();
const rawImgs = [];
for (const base of RAW) for (const L of ['DE', 'FR', 'EN']) {
  const f = `${base}_${L}.html`;
  if (!existsSync(ROOT + 'raw/' + f)) continue;
  const s = readFileSync(ROOT + 'raw/' + f, 'utf8');
  const re = /<img\s+src="data:(image\/[a-z]+);base64,([A-Za-z0-9+/=\s]+)"/g;
  let m, idx = 0;
  while ((m = re.exec(s))) {
    idx++;
    const data = m[2].replace(/\s+/g, '');
    const h = hashString(data);
    // verborgener Bildtext: nächstes <div id="…tif"> vor dem nächsten <img
    const next = s.indexOf('<img', m.index + 10);
    const lim = next < 0 ? s.length : next;
    const tl = s.indexOf('textofimagelink_', m.index);
    let hidden = null;
    if (tl > 0 && tl < lim) {
      const ds0 = s.indexOf('<div id=', tl);
      const de = s.indexOf('</div>', ds0);
      const ps = [...s.slice(ds0, de).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => strip(x[1])).filter(Boolean);
      hidden = ps;
    }
    // Kontext: letzte Anhang-Id und letzte Überschrift vor dem Bild
    const before = s.slice(Math.max(0, m.index - 200000), m.index);
    const anx = [...before.matchAll(/id="(anx_[A-Z]+)"/g)].pop()?.[1] || [...before.matchAll(/ANHANG ([IVX]+)|ANNEXE ([IVX]+)|ANNEX ([IVX]+)/g)].pop()?.slice(1).find(Boolean) || null;
    const head = [...before.slice(-30000).matchAll(/<p[^>]*class="(?:oj-ti-grseq-1|title-gr-seq-level-1|oj-normal|norm)"[^>]*>([\s\S]*?)<\/p>/g)].map((x) => strip(x[1])).filter((t) => t && t.length < 160).slice(-2);
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
    const out = `orig/${f.replace('.html', '')}_${String(idx).padStart(2, '0')}_${h}.${ext}`;
    if (!existsSync(W + out)) writeFileSync(W + out, Buffer.from(data, 'base64'));
    rawImgs.push({ file: f, idx, hash: h, mime: m[1], bytes: data.length * 0.75 | 0, out, anx, head, hidden, inAssets: !!assets[h] });
  }
}

// 3. Asset-Bilder als PNG (für das Read-Werkzeug)
for (const [h, a] of Object.entries(assets)) {
  const p = `${W}asset/${h}.png`;
  if (!existsSync(p)) await sharp(Buffer.from(a.data, 'base64')).png().toFile(p);
}
// Originale zusätzlich als PNG mit Metadaten
for (const r of rawImgs) {
  const meta = await sharp(W + r.out).metadata();
  r.w = meta.width; r.h = meta.height;
}
const list = [...occ.values()].map((o) => ({ ...o, origs: rawImgs.filter((r) => r.hash === o.asset).map((r) => r.out) }));
writeFileSync(W + 'images.json', JSON.stringify({ blocks: list, raw: rawImgs }, null, 1));
console.log('Bild-Blöcke (Einheit/Schlüssel/Sprache/Asset):', list.length, 'Assets:', new Set(list.map((x) => x.asset)).size, 'Bilder in raw/:', rawImgs.length, 'davon in assets.json:', rawImgs.filter((r) => r.inAssets).length, 'mit Bildtext:', rawImgs.filter((r) => r.hidden).length);
for (const o of list) console.log(o.unit, o.key, o.lang, o.asset, o.stages.join(','), 'orig:', o.origs.length);
