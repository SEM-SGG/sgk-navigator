// Gemeinsame Prüfhilfen der UI-Tests (Etappe 1b und Modul Verhandlung).

/** Prüft im Browser: unbeabsichtigter Überlauf, Ellipsen ohne Tooltip, Überlappungen in Standleiste, Zeitstrahl, Inhaltsverzeichnis, Kopfzeile. */
export const layoutCheck = () => {
  const issues = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const inter = (a, b, pad = 0) => a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
  const W = innerWidth;
  if (document.documentElement.scrollWidth > W + 1) issues.push(`Seite scrollt horizontal (${document.documentElement.scrollWidth} > ${W})`);
  // 1. Inhalt ragt aus einem Element ohne vorgesehenes Scrollen
  for (const e of document.querySelectorAll('.app *')) {
    if (!vis(e) || e.closest('.card-host, svg, .tbl-wrap, .tbl-scroll, .mx-wrap, select, option, .sr')) continue;
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowX) || s.display === 'inline') continue;
    if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) {
      // Kinder, die über den rechten Rand hinausragen und sichtbar sind
      const r = e.getBoundingClientRect();
      const over = [...e.children].some((c) => vis(c) && c.getBoundingClientRect().right > r.right + 2 && !c.closest('.blk-go'));
      const clipped = s.overflowX === 'hidden' || s.overflowX === 'clip';
      if (over || clipped && e.scrollWidth > e.clientWidth + 2 && !e.title && !e.closest('[title]')) issues.push(`Überlauf ${name(e)} (${e.scrollWidth} > ${e.clientWidth})`);
    }
    // Ellipse oder Zeilenbegrenzung ohne Tooltip
    const clamped = (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) || (s.webkitLineClamp && s.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 2);
    if (clamped && !e.getAttribute('title') && !e.closest('[title]')) issues.push(`abgeschnitten ohne Tooltip ${name(e)}: ${e.textContent.slice(0, 40)}`);
  }
  // 2. Standleiste
  const bar = document.querySelector('.stagebar');
  if (bar && vis(bar)) {
    const br = bar.getBoundingClientRect();
    if (bar.scrollWidth > bar.clientWidth + 1) issues.push('Standleiste scrollt horizontal');
    const items = [...bar.querySelectorAll('.stg')].map((e) => [e, e.getBoundingClientRect()]);
    for (const [e, r] of items) {
      if (r.left < br.left - 1 || r.right > br.right + 1) issues.push(`Standleiste: Eintrag ausserhalb ${e.textContent.trim()}`);
      for (const c of e.querySelectorAll('.stg-code, .stg-year')) { const cr = c.getBoundingClientRect(); if (cr.right > r.right + 1 || cr.left < r.left - 1) issues.push(`Standleiste: Beschriftung ragt heraus ${c.textContent}`); }
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (inter(items[i][1], items[j][1], 1)) issues.push(`Standleiste: Überlappung ${items[i][0].textContent.trim()} / ${items[j][0].textContent.trim()}`);
  }
  // 3. Zeitstrahl
  const axis = document.querySelector('.tl-axis-track');
  if (axis && vis(axis)) {
    const ar = axis.getBoundingClientRect();
    const labs = [...axis.querySelectorAll('.tl-year, .tl-today')].map((e) => [e, e.getBoundingClientRect()]);
    if (labs.length < 4) issues.push('Zeitstrahl: zu wenige Achsenbeschriftungen');
    for (const [e, r] of labs) if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.right > W) issues.push(`Zeitstrahl: Beschriftung ragt heraus ${e.textContent}`);
    for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) if (inter(labs[i][1], labs[j][1])) issues.push(`Zeitstrahl: Beschriftungen überlappen ${labs[i][0].textContent} / ${labs[j][0].textContent}`);
    for (const row of document.querySelectorAll('.tl-row:not(.tl-axis)')) {
      const st = row.querySelector('.tl-status'), tr = row.querySelector('.tl-track'), act = row.querySelector('.tl-act');
      const sr = st.getBoundingClientRect(), trr = tr.getBoundingClientRect();
      if (sr.right > trr.left + 1) issues.push(`Zeitstrahl: Status überlappt Spur ${st.textContent}`);
      for (const c of st.querySelectorAll('*')) if (c.getBoundingClientRect().right > sr.right + 1) issues.push('Zeitstrahl: Status ragt heraus');
      const range = document.createRange(); range.selectNodeContents(st);
      for (const rr of range.getClientRects()) if (rr.right > sr.right + 1 || rr.bottom > sr.bottom + 1) issues.push(`Zeitstrahl: Statustext ragt heraus ${st.textContent}`);
      const acr = act.getBoundingClientRect();
      for (const m of tr.querySelectorAll('.tl-adopt, .tl-apply, .tl-wait')) { const mr = m.getBoundingClientRect(); if (inter(mr, sr) || inter(mr, acr)) issues.push('Zeitstrahl: Marker überlappt Beschriftung'); if (mr.width > 0 && (mr.left < trr.left - 6 || mr.right > trr.right + 1)) issues.push('Zeitstrahl: Marker ausserhalb der Spur'); }
      if (acr.right > sr.left + 1) issues.push(`Zeitstrahl: Akt überlappt Status ${act.textContent.trim()}`);
    }
  }
  // 4. Inhaltsverzeichnis: Nummer überlappt Titel nicht
  for (const a of document.querySelectorAll('.toc-unit a')) {
    if (!vis(a)) continue;
    const n = a.querySelector('.toc-num'), t = a.querySelector('.toc-title');
    if (!n || !t) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const nr = range.getBoundingClientRect(), tr = t.getBoundingClientRect();
    if (nr.right > tr.left - 2) issues.push(`Inhaltsverzeichnis: Nummer überlappt Titel ${n.textContent}`);
  }
  // 5. Kopfzeile
  const head = document.querySelector('.app-head');
  if (head) {
    const parts = [...head.children].filter(vis).filter((e) => !e.classList.contains('skip')).map((e) => [e, e.getBoundingClientRect()]);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i][1].right > W + 1) issues.push(`Kopfzeile: ${name(parts[i][0])} ragt aus dem Fenster`);
      for (let j = i + 1; j < parts.length; j++) if (inter(parts[i][1], parts[j][1], 1)) issues.push(`Kopfzeile: ${name(parts[i][0])} überlappt ${name(parts[j][0])}`);
    }
    for (const a of head.querySelectorAll('.views a')) if (a.scrollWidth > a.clientWidth + 1) issues.push(`Navigation abgeschnitten: ${a.textContent}`);
  }
  // 6. Matrix-Köpfe und Steuerleisten
  for (const th of document.querySelectorAll('.mx thead th')) for (const c of th.children) if (vis(c) && c.getBoundingClientRect().right > th.getBoundingClientRect().right + 1) issues.push(`Matrixkopf ragt heraus: ${c.textContent}`);
  for (const s of document.querySelectorAll('.toolbar select, .toc select')) {
    if (!vis(s)) continue;
    const o = s.options[s.selectedIndex];
    if (!o) continue;
    const c = document.createElement('canvas').getContext('2d');
    const cs = getComputedStyle(s);
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = c.measureText(o.textContent).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    // 18 px für den nativen Pfeil; bei appearance: none liegt der eigene Chevron im padding-right (Carbon Field)
    const arrow = cs.appearance === 'none' ? 0 : 18;
    if (need > s.clientWidth - arrow) issues.push(`Auswahl abgeschnitten: ${o.textContent}`);
  }
  return issues;
};


/** Schaltflächen: Form ohne Hover erkennbar, Mindestgrösse, Zeiger (im Browser auszuführen). */
export const buttonCheck = () => {
  const out = [];
  for (const b of document.querySelectorAll('button, a.btn, a.btn-icon, [role="button"]')) {
    const r = b.getBoundingClientRect();
    if (!r.width || b.closest('.menu-pop, .stagebar-legend, .card-host') || b.classList.contains('link') || b.matches('.blk')) continue;
    const s = getComputedStyle(b);
    const shaped = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent' || s.boxShadow !== 'none' || s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0;
    const bareOk = b.classList.contains('is-bare') || b.matches('.seg button, .tl-act, .mx-cell button, .chip-btn, .syn-open, .syn-g, .nfig-btn, .th-sort, .nd-tab, .nsum-item');
    if (!shaped && !bareOk) out.push(`ohne Form: ${b.textContent.trim().slice(0, 30) || b.getAttribute('aria-label')}`);
    if (Math.min(r.width, r.height) < 31 && !b.closest('.toc-search')) out.push(`zu klein (${Math.round(r.width)}x${Math.round(r.height)}): ${b.textContent.trim().slice(0, 30) || b.getAttribute('aria-label')}`);
    if (s.cursor !== 'pointer' && !b.disabled && b.getAttribute('aria-disabled') !== 'true') out.push(`kein Zeiger: ${b.textContent.trim().slice(0, 30)}`);
  }
  return out;
};

/**
 * Antwort des SPARQL-Endpunkts wie beim echten Virtuoso: mit Parameter callback als JSONP «name(json)»,
 * Content-Type application/sparql-results+json, ohne CORS-Header.
 */
export async function fulfillSparql(route, bindings) {
  const url = new URL(route.request().url());
  const cb = url.searchParams.get('callback');
  const json = JSON.stringify({ head: { link: [], vars: [] }, results: { distinct: false, ordered: true, bindings } });
  await route.fulfill({ status: 200, contentType: 'application/sparql-results+json', body: cb ? `${cb}(\n\n${json})` : json });
}
export const sparqlBinding = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: 'literal', value: v }]));

/** Ist der SPARQL-Endpunkt aus dem Testbrowser erreichbar (Netz, Proxy)? Für Live-Tests, die ohne Netz übersprungen werden. */
export async function endpointReachable(page) {
  const q = encodeURIComponent('ASK { ?s ?p ?o }');
  try {
    const r = await page.request.get(`https://publications.europa.eu/webapi/rdf/sparql?query=${q}&format=json`, { timeout: 20000 });
    return r.ok();
  } catch { return false; }
}
