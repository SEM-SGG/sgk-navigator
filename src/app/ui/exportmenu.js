// Exportmenü einer Karte.
// Eigenschaften: data, spec (Bildkarte: PNG, PDF als Bild, Druck, Sammelkorb), label, small,
// model (optional, Etappe 3): () => card bzw. () => Promise<card> nach src/export (validateCard). Mit model bietet das Menü
// zusätzlich Word (Redline als Formatierung), Word (Änderungsverfolgung), PDF mit Text (A4, 16:9) und «Als formatierten Text kopieren».
// Ohne model bleibt das Menü wie bisher; ohne spec zeigt es nur die Textformen.
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { Menu, Icon } from './common.js';
import { toast, addToBasket } from '../app.js';
import { t, uiLang } from '../lib/i18n.js';

/** Gemeinsame Exportlogik für Menü und Karte: Einträge mit id, Gruppe, Beschriftung, Hinweis und Aktion. */
function useExportItems(data, spec, model) {
  const [busy, setBusy] = useState(false);
  const run = (what, format) => async () => {
    if (busy) return;
    setBusy(true);
    const s = { ...spec, format, ui: uiLang() };
    try {
      const ex = await import('../export.js');
      if (what === 'png') await ex.exportPng(data, s);
      else if (what === 'pdf') await ex.exportPdf(data, s);
      else if (what === 'print') await ex.printCards(data, [s]);
      if (what !== 'print') toast(t('export.done', { kind: what.toUpperCase() }), 'success', 3000);
    } catch (e) {
      console.error(e);
      toast(t('export.failed', { msg: e.message || String(e) }), 'error');
    } finally { setBusy(false); }
  };
  const runText = (what) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ex = await import('../export.js');
      await ex.exportText({ ...spec, ui: uiLang() }, what, model);
      toast(what === 'clip' ? t('export.copied') : t('export.doneKind', { kind: t('export.kind.' + what) }), 'success', 3000);
    } catch (e) {
      console.error(e);
      toast(t('export.failed', { msg: e.message || String(e) }), 'error');
    } finally { setBusy(false); }
  };
  const items = [];
  if (spec) {
    items.push(
      { sep: true, label: t('export.group.image') },
      { label: t('export.pngA4'), hint: t('export.hint2x'), onClick: run('png', 'a4'), id: 'x-png-a4', fmt: 'a4' },
      { label: t('export.png169'), hint: t('export.hintSlide'), onClick: run('png', '169'), id: 'x-png-169', fmt: '169' },
      { label: t('export.pdfImgA4'), onClick: run('pdf', 'a4'), id: 'x-pdf-a4', fmt: 'a4' },
      { label: t('export.pdfImg169'), onClick: run('pdf', '169'), id: 'x-pdf-169', fmt: '169' },
    );
  }
  if (model) {
    items.push(
      { sep: true, label: t('export.group.text') },
      { label: t('export.docx'), hint: t('export.hintRedline'), onClick: runText('docx'), id: 'x-docx', fmt: 'a4' },
      { label: t('export.docxTracked'), hint: t('export.hintTracked'), onClick: runText('docxTracked'), id: 'x-docx-tracked', fmt: 'a4' },
      { label: t('export.pdfTextA4'), hint: t('export.hintSearch'), onClick: runText('pdftext'), id: 'x-pdftext-a4', fmt: 'a4' },
      { label: t('export.pdfText169'), onClick: runText('pdftext169'), id: 'x-pdftext-169', fmt: '169' },
      { label: t('export.clip'), hint: t('export.hintClip'), onClick: runText('clip'), id: 'x-clip', fmt: 'a4' },
    );
  }
  if (spec) {
    items.push(
      { sep: true, label: t('export.more') },
      { label: t('export.print'), onClick: run('print', 'a4'), id: 'x-print', fmt: 'a4' },
      { label: t('export.basketA4'), onClick: () => addToBasket({ ...spec, format: 'a4', ui: uiLang() }), id: 'x-basket-a4', basket: true },
      { label: t('export.basket169'), onClick: () => addToBasket({ ...spec, format: '169', ui: uiLang() }), id: 'x-basket-169', basket: true },
    );
  }
  return { busy, items };
}

export function ExportMenu({ data, spec, label, small, model }) {
  const { busy, items } = useExportItems(data, spec, model);
  return html`<${Menu} label=${busy ? t('export.busy') : label || t('export.label')} icon="download" align="right" className="export-menu" small=${small} items=${items} />`;
}

/**
 * Exportkarte in der Seitenleiste (Chronologie): Format wählen, optional Begründung beilegen,
 * «Exportieren» (Primär) und «In Sammelkorb» (Ghost). Gleiche Einträge und Logik wie das Exportmenü.
 */
export function ExportCard({ data, spec, model, extra }) {
  const { busy, items } = useExportItems(data, spec, model);
  const groups = [];
  for (const it of items) {
    if (it.sep) groups.push({ label: it.label, items: [] });
    else if (!it.basket && groups.length) groups[groups.length - 1].items.push(it);
  }
  const all = groups.flatMap((g) => g.items);
  const [fmt, setFmt] = useState(all[0] ? all[0].id : '');
  const cur = all.find((x) => x.id === fmt) || all[0];
  const basket = items.find((x) => x.basket && x.id === 'x-basket-' + ((cur && cur.fmt) || 'a4'));
  return html`<section class="side-card xcard" aria-labelledby="xcard-h">
    <h2 class="side-card-title" id="xcard-h">${t('export.label')}</h2>
    <label class="field"><span class="field-label">${t('export.format')}</span>
      <select id="xc-format" value=${cur ? cur.id : ''} onChange=${(e) => setFmt(e.target.value)}>
        ${groups.filter((g) => g.items.length).map((g) => html`<optgroup label=${g.label}>${g.items.map((it) => html`<option value=${it.id}>${it.label}</option>`)}</optgroup>`)}
      </select></label>
    ${cur && cur.hint ? html`<p class="side-card-hint">${cur.hint}</p>` : null}
    ${extra}
    <div class="side-card-actions">
      <button type="button" class="btn btn-primary" id="xc-export" disabled=${busy || !cur} onClick=${() => cur && cur.onClick()}><${Icon} name="download" />${busy ? t('export.busy') : t('export.short')}</button>
      ${basket ? html`<button type="button" class="btn btn-ghost is-bare" id="xc-basket" onClick=${basket.onClick}><${Icon} name="basket" />${t('export.toBasket')}</button>` : null}
    </div>
  </section>`;
}

/** Modellfunktion zu einer Exportspezifikation (Werk oder Vorschau) */
export const specModel = (spec) => async () => {
  const ex = await import('../export.js');
  return ex.modelOf({ ...spec, ui: uiLang() });
};
