// Arbeitshilfe: Bilder nebeneinander (bzw. Ausschnitt vergrössert) als PNG zum Lesen.
// node scripts/forms/sheet.mjs out.png img1 img2 …            (nebeneinander, gleiche Höhe)
// node scripts/forms/sheet.mjs out.png --crop img x y w h [scale]   (Ausschnitt in relativen Koordinaten 0..1)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let sharp; try { sharp = require('sharp'); } catch { sharp = require('/opt/npm-tools/node_modules/sharp'); }
const [out, ...rest] = process.argv.slice(2);
if (rest[0] === '--crop') {
  const [, img, x, y, w, h, scale = '1'] = rest;
  const m = await sharp(img).metadata();
  const L = Math.round(+x * m.width), T = Math.round(+y * m.height), W = Math.round(+w * m.width), H = Math.round(+h * m.height);
  await sharp(img).extract({ left: L, top: T, width: Math.min(W, m.width - L), height: Math.min(H, m.height - T) })
    .resize({ width: Math.round(W * +scale) }).flatten({ background: '#fff' }).png().toFile(out);
} else {
  const H = 500;
  const bufs = await Promise.all(rest.map((p) => sharp(p).flatten({ background: '#fff' }).resize({ height: H }).png().toBuffer({ resolveWithObject: true })));
  const gap = 30; const W = bufs.reduce((s, b) => s + b.info.width + gap, 0);
  let x = 0; const comp = bufs.map((b) => { const c = { input: b.data, left: x, top: 0 }; x += b.info.width + gap; return c; });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#bbb' } }).composite(comp).png().toFile(out);
}
