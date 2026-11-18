// Bilder verkleinern und deduplizieren (sharp, global installiert)
import { createRequire } from 'node:module';
import { writeFileSync, renameSync } from 'node:fs';
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = require('/opt/npm-tools/node_modules/sharp'); }

const BUDGET = 2.5e6;

export async function writeAssets(assets, used, file) {
  const report = { input: 0, used: used.size, items: [], widthMax: 1200, quality: 80, total: 0 };
  const run = async (maxW, quality) => {
    const out = {};
    let total = 0;
    report.items = [];
    for (const h of used) {
      const a = assets[h];
      if (!a) { report.items.push({ hash: h, missing: true }); continue; }
      const buf = Buffer.from(a.data, 'base64');
      const img = sharp(buf);
      const meta = await img.metadata();
      const w = Math.min(maxW, meta.width || maxW);
      const res = await sharp(buf).resize({ width: w, withoutEnlargement: true }).flatten({ background: '#ffffff' }).webp({ quality }).toBuffer({ resolveWithObject: true });
      const data = res.data.toString('base64');
      out[h] = { mime: 'image/webp', data, w: res.info.width, h: res.info.height };
      total += data.length;
      report.items.push({ hash: h, srcMime: a.mime, srcW: meta.width, srcH: meta.height, w: res.info.width, h: res.info.height, bytes: data.length });
    }
    return { out, total };
  };
  let maxW = 1200, q = 80;
  let r = await run(maxW, q);
  while (r.total + 1000 > BUDGET && q > 40) {
    if (maxW > 900) maxW -= 150; else q -= 10;
    r = await run(maxW, q);
  }
  report.widthMax = maxW; report.quality = q; report.total = r.total;
  const tmp = file + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(r.out));
  renameSync(tmp, file);
  return report;
}
