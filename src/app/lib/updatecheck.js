// Hinweis auf neue Versionen: reine Logik (ohne Preact und ohne Browser-APIs ausser dem übergebenen fetch), Einheitstests in
// test/app/updatecheck.test.mjs.
//
// Versionsschema: JJJJ.MM.TT[-n] (Datum des Builds in Europe/Zurich, n = weiterer Build am selben Tag, ab 2). Ein führendes «v»
// ist erlaubt (Git-Tag v2026.12.12). Vergleich numerisch je Teil; nicht lesbare Angaben gelten nie als neuer.

const RE = /^v?(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d+))?$/i;

/** "v2026.12.12-2" -> { y, m, d, n, date: '2026-12-12', text: '2026.12.12-2' } oder null */
export function parseVersion(s) {
  const m = RE.exec(String(s || '').trim());
  if (!m) return null;
  const [y, mo, d, n] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 1];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const p2 = (x) => String(x).padStart(2, '0');
  return { y, m: mo, d, n, date: `${y}-${p2(mo)}-${p2(d)}`, text: `${y}.${p2(mo)}.${p2(d)}${n > 1 ? '-' + n : ''}` };
}

/** <0: a älter als b, 0: gleich, >0: a neuer; null, wenn eine Seite nicht lesbar ist. */
export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a, y = typeof b === 'string' ? parseVersion(b) : b;
  if (!x || !y) return null;
  return (x.y - y.y) || (x.m - y.m) || (x.d - y.d) || (x.n - y.n);
}
export const isNewer = (remote, current) => (compareVersions(remote, current) ?? 0) > 0;

/** Version eines Builds aus Datum (Date) und laufender Nummer am Tag. */
export function versionOfBuild(date, n = 1, timeZone = 'Europe/Zurich') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}.${parts.month}.${parts.day}${n > 1 ? '-' + n : ''}`;
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const httpsUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };

/**
 * Konfiguration prüfen: { kind, endpoint, origin, origins, page?, fallback? } oder null (Funktion aus).
 * fallback: zweite Quelle (z. B. Releases-API), wenn die erste nicht antwortet; origins = alle Ursprünge für die CSP.
 */
export function sourceInfo(src, nested = false) {
  if (!src || !src.kind) return null;
  let info = null;
  if (src.kind === 'github-release') {
    if (!NAME.test(src.owner || '') || !NAME.test(src.repo || '')) return null;
    info = { kind: src.kind, endpoint: `https://api.github.com/repos/${src.owner}/${src.repo}/releases/latest`, origin: 'https://api.github.com', asset: src.asset || 'SGK-Navigator.html', owner: src.owner, repo: src.repo };
  } else if (src.kind === 'manifest') {
    const u = httpsUrl(src.url);
    if (!u) return null;
    info = { kind: src.kind, endpoint: u, origin: new URL(u).origin };
    const pg = httpsUrl(src.page);
    if (pg) info.page = pg;
  } else return null;
  const fb = !nested && src.fallback ? sourceInfo(src.fallback, true) : null;
  if (fb) info.fallback = fb;
  info.origins = [...new Set([info.origin, ...(fb ? [fb.origin] : [])])];
  return info;
}

/** Antwort des Endpunkts -> { version, date, url, notes, page } oder Fehler mit code 'format'. page: «Was ist neu» (https oder null). */
export function parseAnswer(info, json) {
  const fail = () => Object.assign(new Error('format'), { code: 'format' });
  if (!json || typeof json !== 'object') throw fail();
  if (info.kind === 'github-release') {
    const v = parseVersion(json.tag_name) || parseVersion(json.name);
    if (!v || json.draft || json.prerelease) throw fail();
    const a = Array.isArray(json.assets) ? json.assets.find((x) => x && x.name === info.asset) : null;
    const rel = httpsUrl(json.html_url);
    const url = httpsUrl(a && a.browser_download_url) || rel || `https://github.com/${info.owner}/${info.repo}/releases/latest`;
    return { version: v.text, date: v.date, url, notes: null, page: rel };
  }
  const v = parseVersion(json.version);
  const url = httpsUrl(json.url);
  if (!v || !url) throw fail();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(json.date || '') ? json.date : v.date;
  const notes = json.notes && typeof json.notes === 'object' ? { de: String(json.notes.de || ''), fr: String(json.notes.fr || '') } : null;
  return { version: v.text, date, url, notes, page: httpsUrl(json.page) || info.page || null };
}

/**
 * Abfrage. fetchFn: window.fetch (Tests: Ersatz). Fehler: code 'offline' (Netz, Zeitüberschreitung, CORS), 'notfound' (404),
 * 'ratelimit' (403/429), 'status' (übrige HTTP-Fehler, status), 'format'.
 * Mit info.fallback: schlägt die erste Quelle fehl, wird die zweite gefragt (Ergebnis mit via: 'fallback'). Scheitern beide,
 * gilt der Fehler der zweiten, wenn die erste nicht erreichbar war oder fehlte (offline, notfound), sonst der der ersten.
 */
export async function fetchLatest(info, opts = {}) {
  try {
    return await fetchOne(info, opts);
  } catch (e1) {
    if (!info.fallback) throw e1;
    try {
      return { ...(await fetchOne(info.fallback, opts)), via: 'fallback' };
    } catch (e2) {
      throw e1.code === 'offline' || e1.code === 'notfound' ? e2 : e1;
    }
  }
}

async function fetchOne(info, { fetchFn, timeoutMs = 10000 } = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchFn(info.endpoint, {
      method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow',
      headers: info.kind === 'github-release' ? { Accept: 'application/vnd.github+json' } : { Accept: 'application/json' },
      signal: ctl ? ctl.signal : undefined,
    });
  } catch (e) {
    throw Object.assign(new Error('offline'), { code: 'offline', cause: e });
  } finally { if (timer) clearTimeout(timer); }
  if (res.status === 404) throw Object.assign(new Error('notfound'), { code: 'notfound' });
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error('ratelimit'), { code: 'ratelimit' });
  if (!res.ok) throw Object.assign(new Error('status ' + res.status), { code: 'status', status: res.status });
  let json;
  try { json = await res.json(); } catch { throw Object.assign(new Error('format'), { code: 'format' }); }
  return parseAnswer(info, json);
}

// ------------------------------------------------------------------ Taktung und Ausblenden
const dayOf = (d) => { const p2 = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const REMIND_DAYS = 7;

/** Automatische Prüfung fällig? Höchstens einmal je Kalendertag (Ortszeit), nur wenn eingeschaltet. */
export function autoCheckDue(state, now = new Date()) {
  if (state && state.auto === false) return false;
  if (!state || !state.lastCheck) return true;
  const last = new Date(state.lastCheck);
  if (Number.isNaN(last.getTime()) || last > now) return true;
  return dayOf(last) !== dayOf(now);
}

/** Hinweis anzeigen? Nur für eine neuere Version; «Später erinnern» blendet diese Version 7 Tage aus. */
export function shouldShow(result, current, state = {}, now = new Date()) {
  if (!result || !isNewer(result.version, current)) return false;
  const r = state.remind;
  if (r && r.version === result.version && r.until && new Date(r.until) > now) return false;
  return true;
}

/** Zustand nach «Später erinnern». */
export function remindLater(state, version, now = new Date()) {
  return { ...state, remind: { version, until: new Date(now.getTime() + REMIND_DAYS * 86400000).toISOString() } };
}
