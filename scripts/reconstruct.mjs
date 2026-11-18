// SGK-Navigator — Rekonstruktion der Zwischenstaende s03 (2017/2225), s05 (2019/817), s06 (2021/1134)
// aus der konsolidierten Fassung 20240710 (mit Markern) und der konsolidierten Fassung 20170407.
//
// Methode (s. VALIDATION.md): Die Fassung 20240710 ordnet jedem Block den Akt zu, von dem sein Wortlaut stammt
// (Marker ▼Mx mit INSERTED/REPLACED, Loeschmarken ▼Mx —————). Fuer den Stand nach Akt X werden alle Bloecke
// beibehalten, deren Wortlaut von X oder einem frueheren Akt stammt. Bereiche, die ein spaeterer Akt eingefuegt
// oder ersetzt hat, werden entfernt bzw. durch den Wortlaut der Fassung 20170407 an derselben Stelle ersetzt;
// von spaeteren Akten geloeschte Bereiche werden aus 20170407 wiederhergestellt. Die Stelle wird ueber "Anker"
// bestimmt: Bloecke, deren Wortlaut seit 2017 unveraendert ist (gleicher Text in beiden Fassungen).

import { normText } from '../src/core/text.js';
import { applyPatches } from '../src/core/model.js';
import { NOTE } from './build-data.mjs';

export const ACT_ORDER = ['32016R0399', '32016R1624', '32017R0458', '32017R2225', '32018R1240', '32019R0817', '32021R1134', '32024R1717'];
export function actOf(celex) {
  if (!celex) return celex;
  if (/^32016R0399R\(\d+\)$/.test(celex)) return '32016R0399';
  return celex.replace(/R\(\d+\)$/, '');
}
export function rank(celex) {
  const i = ACT_ORDER.indexOf(actOf(celex));
  if (i < 0) throw new Error('Unbekannter Akt in Marker: ' + celex);
  return i;
}
const R458 = rank('32017R0458');

const stripPunct = (t) => normText(t).replace(/[\s.,;:]+$/, '');
const keyText = (b) => (b.ty === 'img' ? null : normText(b.t, { caseFold: b.ty === 'heading' }));

// LCS ueber zwei Folgen mit Gleichheitsfunktion -> Paare [i,j]
function lcsPairs(a, b, eq) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const res = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { res.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return res;
}

// Ein Block der Fassung 2024 mit Herkunft o und Markeraktion act
function originRank(b) { return rank(b.o); }

export function revertUnit(u7, u2, X, report, lang) {
  const rx = rank(X);
  const blocks7 = u7 ? u7.blocks : [];
  const blocks2 = u2 ? u2.blocks : [];
  // Anker: Bloecke mit Herkunft <= 2017/458 und gleichem Wortlaut (ohne Schlusszeichen) in 20170407
  const cand7 = blocks7.map((b, i) => ({ b, i })).filter((x) => x.b.ty !== 'img' && originRank(x.b) <= R458);
  const cand2 = blocks2.map((b, i) => ({ b, i })).filter((x) => x.b.ty !== 'img');
  const pairs = lcsPairs(cand7, cand2, (x, y) => stripPunct(x.b.t) === stripPunct(y.b.t) && (x.b.ty === 'heading') === (y.b.ty === 'heading') || (x.b.ty === 'heading' && y.b.ty === 'heading' && keyText(x.b) === keyText(y.b)));
  const anchors = pairs.map(([a, b]) => [cand7[a].i, cand2[b].i]);
  const out = [];
  const dels = (u7 && u7.deletions) || [];
  // Hilfsfunktion: Bereich zwischen Ankern
  const region = (i7a, i7b, i2a, i2b) => {
    const R7 = blocks7.slice(i7a, i7b);
    const R2 = blocks2.slice(i2a, i2b).filter((b) => b.ty !== 'img');
    const marks = dels.filter((d) => d.at >= i7a && d.at <= i7b && (d.at > i7a || i7a === 0 || true) && d.at < i7b + 1).filter((d) => d.at >= i7a && d.at <= i7b);
    const later = new Set(), earlier = new Set();
    for (const b of R7) { const r = originRank(b); if (r > rx) later.add(actOf(b.o)); else if (r > R458) earlier.add(actOf(b.o)); }
    for (const d of marks) { const r = rank(d.act); if (r > rx) later.add(actOf(d.act)); else if (r > R458) earlier.add(actOf(d.act)); }
    const keep7 = R7.filter((b) => originRank(b) <= rx);
    // Bloecke mit Herkunft <= 2017/458, die nicht als Anker passen: unmarkierte Abweichung
    for (const b of R7) if (b.ty !== 'img' && originRank(b) <= R458) report.unmarked.push({ lang, unit: u7.id, key: b.k, text: b.t, X });
    if (!later.size) {
      if (R2.length && !earlier.size) report.anomalies.push({ lang, unit: (u7 || u2).id, X, kind: 'R2-ohne-Marker', keys2: R2.map((b) => b.k), keys7: R7.map((b) => b.k) });
      out.push(...keep7.map((b) => ({ ...b, src: '2024' })));
      return;
    }
    if (!earlier.size) {
      // Nur spaetere Akte: Fassung 2017 wiederherstellen; Bloecke 2024 mit Herkunft <= 2017/458 (unmarkiert) ebenfalls durch 2017 ersetzt
      const keepImg = R7.filter((b) => b.ty === 'img' && originRank(b) <= rx);
      out.push(...R2.map((b) => ({ ...b, src: '2017' })));
      out.push(...keepImg.map((b) => ({ ...b, src: '2024' })));
      if (u2 && R7.some((b) => b.ty === 'img' && originRank(b) > rx)) report.anomalies.push({ lang, unit: u7.id, X, kind: 'Bild-spaeter-ersetzt' });
      report.restored.push({ lang, unit: (u7 || u2).id, X, later: [...later], keys2: R2.map((b) => b.k), removed7: R7.filter((b) => originRank(b) > rx).map((b) => b.k) });
      return;
    }
    // Gemischter Bereich: frueherer und spaeterer Akt im selben Bereich
    if (R2.length) report.mixed.push({ lang, unit: (u7 || u2).id, X, later: [...later], earlier: [...earlier], keys7: R7.map((b) => `${b.k}:${actOf(b.o).slice(-4)}`), keys2: R2.map((b) => b.k) });
    // Aufloesung: Bloecke der spaeteren Akte entfernen; Bloecke 2017, deren Schluessel ein spaeterer Akt ersetzt oder geloescht hat, wiederherstellen
    const laterKeys = new Set(R7.filter((b) => originRank(b) > rx).map((b) => b.k));
    const earlierKeys = new Set(R7.filter((b) => originRank(b) <= rx).map((b) => b.k));
    const merged = [];
    for (const b of R7) {
      if (originRank(b) <= rx) merged.push({ ...b, src: '2024' });
      else {
        const old = R2.find((x) => x.k === b.k && !earlierKeys.has(x.k));
        if (old && !merged.includes(old)) merged.push({ ...old, src: '2017' });
      }
    }
    for (const b of R2) if (!laterKeys.has(b.k) && !earlierKeys.has(b.k) && marks.some((d) => rank(d.act) > rx)) merged.push({ ...b, src: '2017', review: true });
    out.push(...merged);
  };
  let p7 = 0, p2 = 0;
  for (const [a7, a2] of anchors) {
    region(p7, a7, p2, a2);
    const b7 = blocks7[a7], b2 = blocks2[a2];
    // Ankertext: Wortlaut 2017, ausser die Schlusszeichensetzung wurde wegen einer Einfuegung durch einen Akt <= X angepasst
    if (normText(b7.t, { caseFold: b7.ty === 'heading' }) !== normText(b2.t, { caseFold: b2.ty === 'heading' })) {
      const nxt = blocks7.slice(a7 + 1).find((x) => x.ty !== 'img');
      const insertedBy = nxt && nxt.act === 'INSERTED' ? actOf(nxt.o) : null;
      const cause = insertedBy || (blocks7.slice(a7 + 1).find((x) => x.act === 'INSERTED' && x.k.split('.').length === b7.k.split('.').length) || {}).o || null;
      const entry = { lang, unit: u7.id, key: b7.k, X, before: b2.t, after: b7.t, cause: cause ? actOf(cause) : null };
      report.punct.push(entry);
      if (cause && rank(cause) <= rx) out.push({ ...b7, o: b2.o, x: 'punct', causeAct: actOf(cause), src: '2024' });
      else if (rx === rank('32024R1717')) out.push({ ...b7, o: b2.o, x: 'editorial', src: '2024' });
      else out.push({ ...b2, src: '2017' });
    } else {
      out.push({ ...b7, src: '2024' });
    }
    p7 = a7 + 1; p2 = a2 + 1;
  }
  region(p7, blocks7.length, p2, blocks2.length);
  return out;
}

function revertParsed(p7, p2, X, report, lang) {
  const rx = rank(X);
  const units = [];
  const ids = [];
  for (const u of p7.units) ids.push(u.id);
  for (const u of p2.units) if (!ids.includes(u.id)) report.anomalies.push({ lang, unit: u.id, kind: 'Einheit-nur-2017' });
  for (const id of ids) {
    const u7 = p7.units.find((u) => u.id === id);
    const u2 = p2.units.find((u) => u.id === id);
    const blocks = revertUnit(u7, u2, X, report, lang);
    if (!blocks.length) { if (u2) report.anomalies.push({ lang, unit: id, X, kind: 'leer' }); continue; }
    if (!u2 && blocks.every((b) => b.src === '2024') === false) report.anomalies.push({ lang, unit: id, X, kind: 'neu-mit-2017-Bloecken' });
    // Schluessel eindeutig?
    const seen = new Set();
    for (const b of blocks) { if (seen.has(b.k)) report.anomalies.push({ lang, unit: id, X, kind: 'Schluessel-doppelt', key: b.k }); seen.add(b.k); }
    const titleFrom7 = !u2 || rank(u7.titleOrigin || u7.labelOrigin || '32016R0399') <= rx;
    units.push({ ...u7, title: titleFrom7 ? u7.title : u2.title, blocks });
  }
  // Gliederung: Divisionen, deren Ueberschrift ein spaeterer Akt geaendert oder eingefuegt hat
  const toc = [];
  for (const t of p7.toc) {
    if (t.type === 'article' || t.type === 'annex') { if (units.some((u) => u.id === t.id)) toc.push(t); continue; }
    const t2 = p2.toc.find((x) => x.id === t.id);
    if (t.origin && rank(t.origin) > rx) {
      if (t2) toc.push({ ...t, heading: t2.heading, label: t2.label, origin: t2.origin });
      else if (units.some((u) => u.parent === t.id)) toc.push(t);
      continue;
    }
    toc.push(t);
  }
  return { ...p7, units, toc, hasImages: true, reconstructed: X };
}

// Pruefung: Ruecknahme bis 2017/458 muss die Fassung 20170407 ergeben; Ruecknahme bis 2024/1717 die Fassung 20240710
function selfCheck(p7, p2, lang, report) {
  const rep = { unmarked: [], anomalies: [], restored: [], mixed: [], punct: [] };
  const r458 = revertParsed(p7, p2, '32017R0458', rep, lang);
  let diff = 0;
  const details = [];
  for (const u2 of p2.units) {
    const u = r458.units.find((x) => x.id === u2.id);
    const a = (u ? u.blocks : []).filter((b) => b.ty !== 'img').map((b) => normText(b.t, { caseFold: b.ty === 'heading' }));
    const b = u2.blocks.filter((x) => x.ty !== 'img').map((x) => normText(x.t, { caseFold: x.ty === 'heading' }));
    if (a.join('\n') !== b.join('\n')) { diff++; details.push(u2.id); }
  }
  for (const u of r458.units) if (!p2.units.some((x) => x.id === u.id)) { diff++; details.push(u.id + '(zusaetzlich)'); }
  report.selfCheck[lang] = { revertTo458VsConsolidated20170407: { unitsDifferent: diff, units: details } };
}

export function reconstructStages({ parseRaw, LANGS, patches, log }) {
  const report = { unmarked: [], anomalies: [], restored: [], mixed: [], punct: [], selfCheck: {}, patches: [] };
  const p7 = Object.fromEntries(LANGS.map((l) => [l, parseRaw('02016R0399-20240710', l)]));
  const p2 = Object.fromEntries(LANGS.map((l) => [l, parseRaw('02016R0399-20170407', l)]));
  for (const l of LANGS) selfCheck(p7[l], p2[l], l, report);
  const rankFn = (c) => { try { return rank(c); } catch { return -1; } };
  const mk = (X, l, withPatch) => {
    let p = revertParsed(p7[l], p2[l], X, report, l);
    if (withPatch) {
      const r = applyPatches(p, patches, { lang: l, actRank: rankFn });
      report.patches.push({ X, lang: l, applied: r.applied });
      p = r.parsed;
    }
    return p;
  };
  const N = (de, fr, en) => ({ de, fr, en });
  const stages = [
    { stage: { id: 's03', act: '32017R2225', order: 3, date: '2017-12-09', source: { kind: 'reconstructed', celex: '02016R0399-20240710', note: N(
      'Rekonstruiert: Stand nach der Verordnung (EU) 2017/2225 (inkl. Berichtigung 32017R2225R(01)). Grundlage: konsolidierte Fassungen vom 10.7.2024 (Marker) und 7.4.2017; geprüft gegen den Text des Änderungsakts. Keine amtliche oder EUR-Lex-Fassung.',
      'Reconstitué: état après le règlement (UE) 2017/2225 (y compris le rectificatif 32017R2225R(01)), à partir des versions consolidées du 10.7.2024 et du 7.4.2017; vérifié par rapport au texte de l’acte modificatif. Pas une version officielle ni EUR-Lex.',
      'Reconstructed: state after Regulation (EU) 2017/2225 (including corrigendum 32017R2225R(01)), from the consolidated versions of 10.7.2024 and 7.4.2017; checked against the text of the amending act. Not an official or EUR-Lex version.') } },
      byLang: Object.fromEntries(LANGS.map((l) => [l, mk('32017R2225', l, false)])) },
    { stage: { id: 's04', act: '32018R1240', order: 4, date: '2018-09-19', source: { kind: 'patched', celex: '02018R1240-20260612', note: N(
      'Rekonstruiert: Stand s03 ergänzt um die Änderungen durch Art. 80 der Verordnung (EU) 2018/1240 (ETIAS) in der berichtigten Fassung (32018R1240R(03)); Wortlaut aus der konsolidierten Fassung der Verordnung (EU) 2018/1240 vom 12.6.2026. EUR-Lex hat diese Änderungen in keine konsolidierte Fassung des SGK eingearbeitet.',
      'Reconstitué: état s03 complété par les modifications de l’article 80 du règlement (UE) 2018/1240 (ETIAS), tel que rectifié (32018R1240R(03)); texte repris de la version consolidée du règlement (UE) 2018/1240 du 12.6.2026. EUR-Lex n’a intégré ces modifications dans aucune version consolidée du CFS.',
      'Reconstructed: state s03 supplemented by the amendments made by Article 80 of Regulation (EU) 2018/1240 (ETIAS), as corrected (32018R1240R(03)); wording taken from the consolidated version of Regulation (EU) 2018/1240 of 12.6.2026. EUR-Lex has not incorporated these amendments into any consolidated version of the SBC.') } },
      byLang: Object.fromEntries(LANGS.map((l) => [l, mk('32017R2225', l, true)])) },
    { stage: { id: 's05', act: '32019R0817', order: 5, date: '2019-05-22', source: { kind: 'reconstructed', celex: '02016R0399-20240710', note: N(
      'Rekonstruiert: Stand nach der Verordnung (EU) 2019/817 (Interoperabilität), einschliesslich ETIAS-Ergänzung. Grundlage: konsolidierte Fassungen vom 10.7.2024 und 7.4.2017; geprüft gegen den Text des Änderungsakts.',
      'Reconstitué: état après le règlement (UE) 2019/817 (interopérabilité), y compris le complément ETIAS. À partir des versions consolidées du 10.7.2024 et du 7.4.2017; vérifié par rapport au texte de l’acte modificatif.',
      'Reconstructed: state after Regulation (EU) 2019/817 (interoperability), including the ETIAS supplement. From the consolidated versions of 10.7.2024 and 7.4.2017; checked against the text of the amending act.') } },
      byLang: Object.fromEntries(LANGS.map((l) => [l, mk('32019R0817', l, true)])) },
    { stage: { id: 's06', act: '32021R1134', order: 6, date: '2021-07-13', source: { kind: 'reconstructed', celex: '02016R0399-20240710', note: N(
      'Rekonstruiert: Stand nach der Verordnung (EU) 2021/1134 (VIS), einschliesslich ETIAS-Ergänzung. Grundlage: konsolidierte Fassungen vom 10.7.2024 und 7.4.2017; geprüft gegen den Text des Änderungsakts.',
      'Reconstitué: état après le règlement (UE) 2021/1134 (VIS), y compris le complément ETIAS. À partir des versions consolidées du 10.7.2024 et du 7.4.2017; vérifié par rapport au texte de l’acte modificatif.',
      'Reconstructed: state after Regulation (EU) 2021/1134 (VIS), including the ETIAS supplement. From the consolidated versions of 10.7.2024 and 7.4.2017; checked against the text of the amending act.') } },
      byLang: Object.fromEntries(LANGS.map((l) => [l, mk('32021R1134', l, true)])) },
    { stage: { id: 's07', act: '32024R1717', order: 7, date: '2024-07-10', source: { kind: 'patched', celex: '02016R0399-20240710', note: NOTE.c20240710 } },
      byLang: Object.fromEntries(LANGS.map((l) => [l, mk('32024R1717', l, true)])) },
  ];
  return {
    stages,
    report,
    finalize(ds) {
      // Bloecke mit Hilfsfeldern bereinigen erfolgt in cleanBlock (model.js)
    },
  };
}
