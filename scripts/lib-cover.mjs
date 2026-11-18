// Gemeinsame Pruefhilfen: Abdeckung Parser/Datensatz gegen Quelltext (wortweise, Myers-Diff).
import { diffArrays } from 'diff';
import { tokens } from '../src/core/text.js';

// Text eines Parser-Ergebnisses in Dokumentreihenfolge (Gliederung, Bezeichnung, Titel, Label, Text; ohne Bilder)
export function concatParsed(p, { withImages = false } = {}) {
  const parts = [];
  const tocDiv = new Map(p.toc.filter((t) => t.type !== 'article' && t.type !== 'annex').map((t) => [t.id, t]));
  for (const t of p.toc) {
    if (tocDiv.has(t.id)) { parts.push(t.label, t.heading); continue; }
    const u = p.units.find((x) => x.id === t.id);
    if (!u) continue;
    parts.push(u.label, u.title || '');
    for (const b of u.blocks) { if (b.ty === 'img' && !withImages) continue; parts.push(b.l || '', b.t); }
  }
  return parts.join(' ');
}

export function compareTokens(srcText, outText, { maxGaps = 200 } = {}) {
  const a = tokens(srcText), b = tokens(outText);
  const d = diffArrays(a, b);
  let common = 0, missing = 0, extra = 0;
  const gaps = [];
  let pos = 0;
  for (const part of d) {
    if (!part.added && !part.removed) { common += part.count; pos += part.count; continue; }
    if (part.removed) missing += part.count; else extra += part.count;
    if (gaps.length < maxGaps) {
      const ctxBefore = a.slice(Math.max(0, pos - 8), pos).join(' ');
      gaps.push({ type: part.removed ? 'fehlt' : 'zusaetzlich', text: part.value.join(' ').slice(0, 300), context: ctxBefore.slice(-120) });
    }
    if (part.removed) pos += part.count;
  }
  return { srcTokens: a.length, outTokens: b.length, common, missing, extra, coverage: a.length ? common / a.length : 1, gaps };
}
