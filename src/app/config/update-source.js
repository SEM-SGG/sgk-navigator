// Projekt und Quelle für den Hinweis auf neue Versionen des SGK-Navigators (src/app/lib/updatecheck.js,
// src/app/ui/updatenotice.js, Info, Download-Seite scripts/build-site.mjs).
//
// Nur diese Datei anpassen, wenn das Repo umzieht (Organisation oder Name). Beim Build überschreibbar:
//   node build.mjs --update-source manifest:<https-URL>[+github-release:<owner>/<repo>[/<asset>]]
//   node build.mjs --update-source github-release:<owner>/<repo>[/<asset>]
//   node build.mjs --update-source none          (Funktion aus: keine Abfrage, kein Bedienelement, keine Ergänzung der CSP)
// gleichwertig Umgebungsvariable SGK_UPDATE_SOURCE.
//
// Vorgabe: Manifest version.json auf GitHub Pages des Repos (Pages sendet Access-Control-Allow-Origin: *, kein Limit von
// 60 Anfragen pro Stunde wie die GitHub-API ohne Anmeldung). Ist das Manifest nicht erreichbar, fragt das Tool ersatzweise die
// Releases-API ab (fallback).
// kind 'manifest': JSON { "version": "2026.12.12", "date": "2026-12-12", "url": "https://…/SGK-Navigator.html",
//   "page": "https://…/" (optional, «Was ist neu»), "notes": { "de": "…", "fr": "…" } }, nur https.
// kind 'github-release': https://api.github.com/repos/{owner}/{repo}/releases/latest (öffentliches Repo). Version = tag_name
//   (Schema JJJJ.MM.TT[-n], «v» davor erlaubt). Download = browser_download_url des Assets {asset}, sonst die Release-Seite.
export const OWNER = 'SEM-SGG';
export const REPO = 'sgk-navigator';
export const ASSET = 'SGK-Navigator.html';

/** Links des Projekts (Info, Update-Hinweis, Download-Seite). */
export const PROJECT = {
  owner: OWNER,
  repo: REPO,
  asset: ASSET,
  page: `https://${OWNER.toLowerCase()}.github.io/${REPO}/`,
  source: `https://github.com/${OWNER}/${REPO}`,
  issues: `https://github.com/${OWNER}/${REPO}/issues/new/choose`,
  releases: `https://github.com/${OWNER}/${REPO}/releases`,
  latest: `https://github.com/${OWNER}/${REPO}/releases/latest/download/${ASSET}`,
  docs: `https://${OWNER.toLowerCase()}.github.io/${REPO}/dokumentation.html`,
  // Funktionsadresse für Rückmeldungen ohne GitHub-Konto (keine Personenadresse)
  contact: 'sektion-grenze@sem.admin.ch',
};

/**
 * Etikett «BETA» rechts neben dem Produktnamen in der Kopfzeile (src/app/ui/brandextras.js), während der Erprobung.
 * Auf false setzen, um das Etikett zu entfernen (AGENTS.md, Ablauf «BETA-Kennzeichnung entfernen»). Das Symbol «Fehler
 * melden oder Änderung vorschlagen» daneben hängt nicht an diesem Schalter, sondern an PROJECT.issues.
 */
export const BETA = true;

export const DEFAULT_UPDATE_SOURCE = {
  kind: 'manifest',
  url: `${PROJECT.page}version.json`,
  page: PROJECT.page,
  fallback: { kind: 'github-release', owner: OWNER, repo: REPO, asset: ASSET },
};

/* global __SGK_UPDATE_SOURCE__ */
// Beim Build gesetzte Quelle (build.mjs, define) hat Vorrang vor der Vorgabe oben.
export const UPDATE_SOURCE = typeof __SGK_UPDATE_SOURCE__ !== 'undefined' && __SGK_UPDATE_SOURCE__ ? __SGK_UPDATE_SOURCE__ : DEFAULT_UPDATE_SOURCE;
