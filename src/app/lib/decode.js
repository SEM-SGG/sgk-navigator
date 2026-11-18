// Text einer gespeicherten HTML-Datei robust dekodieren (Chrome/Edge «Webseite, nur HTML» speichert die Originalbytes,
// «Webseite, komplett» die serialisierte Seite; andere Programme können UTF-16 oder eine BOM schreiben).
// Reihenfolge: BOM, gültiges UTF-8, deklarierter Zeichensatz (<meta charset>), sonst windows-1252.

/** Dekodiert die Bytes einer HTML-Datei (Uint8Array) zu Text. */
export function decodeHtml(u8) {
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  // UTF-16 ohne BOM: jedes zweite Byte 0 am Anfang («<\0h\0t\0m\0l\0»)
  if (u8.length >= 8 && u8[0] === 0x3c && u8[1] === 0 && u8[3] === 0 && u8[5] === 0) return new TextDecoder('utf-16le').decode(u8);
  if (u8.length >= 8 && u8[0] === 0 && u8[1] === 0x3c && u8[2] === 0 && u8[4] === 0) return new TextDecoder('utf-16be').decode(u8);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { /* kein gültiges UTF-8 */ }
  const head = new TextDecoder('windows-1252').decode(u8.subarray(0, 4096));
  const m = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i);
  const enc = m ? m[1].toLowerCase() : 'windows-1252';
  try { return new TextDecoder(enc).decode(u8); } catch { return new TextDecoder('windows-1252').decode(u8); }
}

/** Liest eine Datei (File/Blob) als HTML-Text. */
export async function readHtmlFile(file) {
  if (typeof file.arrayBuffer === 'function') return decodeHtml(new Uint8Array(await file.arrayBuffer()));
  return file.text();
}

/** Als «Webseite, eine Datei» (MHTML) gespeichert? Diese Form enthält das HTML kodiert und lässt sich nicht auswerten. */
export const isMhtml = (text) => /^\s*(From: <Saved by |MIME-Version: 1\.0)/i.test(text.slice(0, 400)) && /multipart\/related/i.test(text.slice(0, 2000));
