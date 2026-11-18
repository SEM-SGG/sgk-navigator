// Exportkarten einer Zeile (Chronologie einer Spur, Vergleich zweier Zellen) als PNG oder PDF, wie im SGK-Modul.
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { Menu } from '../../ui/common.js';
import { toast } from '../../app.js';
import { fmtDate, todayIso } from '../../lib/format.js';
import { FORMATS } from '../../ui/card.js';
import { visibleRowId, topClassification, sanitizeInline } from './core.js';
import { trackName, docLabel } from './ui.js';

/** Kopf und Fuss einer Karte; body: VNode. */
function NegCard({ d, row, sub, body, sources, format, fs, legend }) {
  const f = FORMATS[format] || FORMATS.a4;
  const cls = topClassification(d);
  return html`<article class=${'card card-' + format + ' ncard'} lang=${uiLang()} style=${{ width: f.w + 'px', minHeight: f.h ? f.h + 'px' : undefined, '--fs': fs + 'px' }}>
    <header class="card-head cbrk">
      <div class="card-brand"><span>SGK Navigator | ${t('neg.module')}</span><span>${cls && cls !== 'public' ? t('neg.class.' + cls) : d.procedure || ''}</span></div>
      <h1 class="card-title">${row.label || visibleRowId(row.id)}</h1>
      <p class="card-sub">${sub}</p>
      <p class="card-unit">${d.short || d.title}${d.procedure ? ', ' + d.procedure : ''} | ${t('neg.card.row', { id: visibleRowId(row.id), num: row.num || '–' })}</p>
    </header>
    <div class="card-body">${body}</div>
    <footer class="card-foot cbrk">
      ${legend ? html`<div class="card-legend"><span class="lg-item"><ins>${t('neg.legend.ins')}</ins></span><span class="lg-item"><del>${t('neg.legend.del')}</del></span></div>` : null}
      <p class="card-source">${t('neg.card.source', { list: sources.join('; ') })} ${d.demo ? t('neg.card.demo') + ' ' : ''}${t('neg.card.created', { date: fmtDate(todayIso()) })}</p>
    </footer>
  </article>`;
}

/** Karte "Chronologie einer Spur": steps aus rowHistory mit diffHtml. */
export function chronCard(d, row, track, steps, dm) {
  return (fs, format) => html`<${NegCard} d=${d} row=${row} fs=${fs} format=${format} legend=${steps.some((s) => s.diff)}
    sub=${t('neg.card.subChron', { track: trackName(d, track) })}
    sources=${steps.map((s) => docLabel(dm.get(s.doc)))}
    body=${html`<ol class="card-chron">${steps.map((s) => html`<li class="cstep cbrk" style=${{ '--act': 'var(--ink-muted)' }}>
      <div class="cstep-head"><b>${docLabel(dm.get(s.doc))}</b><span class="cstep-chg">${t('neg.chg.' + s.change)}</span>${s.status ? html`<span>${t('neg.status.' + s.status)}</span>` : null}</div>
      <div class="cstep-text legal" lang="en" dangerouslySetInnerHTML=${{ __html: s.empty ? '' : s.diffHtml }}></div>
    </li>`)}</ol>`} />`;
}
/** Karte "Vergleich zweier Zellen". */
export function compareCard(d, row, a, b, res, layout) {
  return (fs, format) => html`<${NegCard} d=${d} row=${row} fs=${fs} format=${format} legend=${true}
    sub=${t('neg.card.subCompare', { a: a.title, b: b.title })} sources=${[a.title, b.title]}
    body=${layout === 'redline'
      ? html`<div class="legal" lang="en" dangerouslySetInnerHTML=${{ __html: res.redline }}></div>`
      : html`<div class="ncard-cmp"><div><p class="ncard-h">${a.title}</p><div class="legal" lang="en" dangerouslySetInnerHTML=${{ __html: res.oldHtml }}></div></div><div><p class="ncard-h">${b.title}</p><div class="legal" lang="en" dangerouslySetInnerHTML=${{ __html: res.newHtml }}></div></div></div>`} />`;
}

const fileSafe = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Kartenmodell (src/export) als Word, PDF mit Text oder formatierter Text in die Zwischenablage. */
export async function exportModel(model, what, name) {
  const card = typeof model === 'function' ? await model() : model;
  const ex = await import('../../../export/index.js');
  const base = fileSafe(name);
  if (what === 'docx' || what === 'docx-tracked') {
    const { getBy } = await import('../../lib/user.js');
    const bytes = ex.cardToDocx(card, { redline: what === 'docx-tracked' ? 'tracked' : 'format', author: getBy() || 'SGK-Navigator', date: new Date().toISOString() });
    const { download } = await import('./store.js');
    download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${base}${what === 'docx-tracked' ? '_' + t('neg.cm.fileTracked') : ''}.docx`);
    return 'Word';
  }
  if (what === 'pdf-a4' || what === 'pdf-169') {
    const bytes = ex.cardToPdf(card, { format: what === 'pdf-a4' ? 'a4' : '16x9' });
    const { download } = await import('./store.js');
    download(new Blob([bytes], { type: 'application/pdf' }), `${base}_${what === 'pdf-a4' ? 'A4' : '16x9'}.pdf`);
    return 'PDF';
  }
  if (what === 'copy') {
    const { html: h, text } = ex.cardToClipboard(card);
    if (navigator.clipboard && window.ClipboardItem) await navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([h], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else throw new Error(t('neg.cm.noClipboard'));
    return null;
  }
  throw new Error('unknown');
}

/**
 * Exportmenü einer Karte: Bild/PDF der Karte (draw, wie im SGK-Modul) und, mit `model` (Kartenmodell nach src/export, SPEC3 §5),
 * Word mit Redline, Word mit Änderungsverfolgung, PDF mit durchsuchbarem Text, formatierten Text kopieren.
 */
export function CardMenu({ draw, model, name, title, small, label }) {
  const [busy, setBusy] = useState(false);
  const run = (what, format) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ex = await import('../../export.js');
      await ex.exportCustom({ draw: (fs) => draw(fs, format), format, name: `${fileSafe(name)}_${format === '169' ? '16x9' : 'A4'}`, title, ui: uiLang() }, what);
      toast(t('export.done', { kind: what.toUpperCase() }), 'success', 3000);
    } catch (e) { console.error(e); toast(t('export.failed', { msg: e.message || String(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const runModel = (what) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      const kind = await exportModel(model, what, name);
      toast(kind ? t('export.done', { kind }) : t('neg.cm.copied'), 'success', 3000);
    } catch (e) { console.error(e); toast(t('export.failed', { msg: e.message || String(e) }), 'error'); }
    finally { setBusy(false); }
  };
  const items = [];
  if (model) items.push(
    { sep: true, label: t('neg.cm.secText') },
    { label: t('neg.cm.wordFormat'), hint: t('neg.cm.wordFormatHint'), onClick: runModel('docx') },
    { label: t('neg.cm.wordTracked'), hint: t('neg.cm.wordTrackedHint'), onClick: runModel('docx-tracked') },
    { label: t('neg.cm.pdfA4'), onClick: runModel('pdf-a4') },
    { label: t('neg.cm.pdf169'), onClick: runModel('pdf-169') },
    { label: t('neg.cm.copy'), hint: t('neg.cm.copyHint'), onClick: runModel('copy') },
  );
  if (draw) items.push(
    { sep: true, label: t('export.fmt.a4Long') },
    { label: t('export.pngA4'), hint: t('export.hint2x'), onClick: run('png', 'a4') },
    { label: t('export.pdfA4'), onClick: run('pdf', 'a4') },
    { sep: true, label: t('export.fmt.169Long') },
    { label: t('export.png169'), hint: t('export.hintSlide'), onClick: run('png', '169') },
    { label: t('export.pdf169'), onClick: run('pdf', '169') },
  );
  return html`<${Menu} label=${busy ? t('export.busy') : label || t('export.label')} icon="download" align="right" className="export-menu" small=${small} items=${items} />`;
}
export { sanitizeInline };
