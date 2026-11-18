# Erzeugt src/export/fonts-data.js: Teilmengen-Schriften (TTF) für den PDF-Export, zlib-komprimiert, base64.
#
# Aufruf (aus dem Repo-Wurzelverzeichnis):  python3 -I test/export/tools/make-fonts.py
# Voraussetzungen: fontTools (pip install fonttools), npm-Pakete @expo-google-fonts/ibm-plex-serif und
# @expo-google-fonts/ibm-plex-sans (devDependencies; Google-Fonts-TTF, Lizenz SIL OFL 1.1).
#
# Umbenennung: IBM Plex trägt den reservierten Schriftnamen «Plex» (OFL Ziff. 3). Eine Teilmenge ist eine
# geänderte Fassung und darf den Namen nicht tragen: daher Familien «SGKN Serif» (aus IBM Plex Serif) und
# «SGKN Sans» (aus IBM Plex Sans), Design System Carbon. Fett ist der Schnitt SemiBold (600; Carbon verwendet nie 700).
# Copyright- und Lizenzeinträge (name ID 0, 13, 14) bleiben unverändert erhalten. Lizenztext: src/export/fonts/OFL.txt.
import base64, copy, hashlib, io, json, os, sys, zlib
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.getcwd()
NM = os.path.join(ROOT, 'node_modules', '@expo-google-fonts')
OUT = os.path.join(ROOT, 'src', 'export', 'fonts-data.js')

# Zeichenvorrat: Latein inkl. Erweiterung A, Satzzeichen, Hoch-/Tiefstellung, einige mathematische Zeichen.
RANGES = [
    (0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F), (0x192, 0x192), (0x218, 0x21B), (0x2BB, 0x2BC), (0x2C6, 0x2C7),
    (0x2D8, 0x2DD), (0x1E9E, 0x1E9E), (0x2002, 0x200B), (0x2010, 0x2027), (0x202F, 0x2030), (0x2032, 0x2033),
    (0x2039, 0x203A), (0x2044, 0x2044), (0x2070, 0x2071), (0x2074, 0x208E), (0x20AC, 0x20AC), (0x2116, 0x2116),
    (0x2122, 0x2122), (0x2190, 0x2193), (0x2212, 0x2212), (0x2215, 0x2215), (0x221E, 0x221E), (0x2248, 0x2248),
    (0x2260, 0x2260), (0x2264, 0x2265), (0x25A0, 0x25A1), (0x25CF, 0x25CF), (0xFFFD, 0xFFFD),
]
UNICODES = [c for a, b in RANGES for c in range(a, b + 1)]

FONTS = [
    # key, Paket, Datei, neuer Familienname, Stil
    ('serif-regular', 'ibm-plex-serif', '400Regular/IBMPlexSerif_400Regular.ttf', 'SGKN Serif', 'Regular'),
    ('serif-italic', 'ibm-plex-serif', '400Regular_Italic/IBMPlexSerif_400Regular_Italic.ttf', 'SGKN Serif', 'Italic'),
    ('serif-bold', 'ibm-plex-serif', '600SemiBold/IBMPlexSerif_600SemiBold.ttf', 'SGKN Serif', 'Bold'),
    ('sans-regular', 'ibm-plex-sans', '400Regular/IBMPlexSans_400Regular.ttf', 'SGKN Sans', 'Regular'),
    ('sans-bold', 'ibm-plex-sans', '600SemiBold/IBMPlexSans_600SemiBold.ttf', 'SGKN Sans', 'SemiBold'),
]


# Bevorzugter Codepunkt, wenn mehrere Codepunkte dieselbe Glyphe nutzen (der andere erhält eine Kopie)
PRIMARY = {0x20, 0x2D, 0x2018, 0x2019, 0x2009, 0x2044}
# Fehlende Zeichen als Kopie einer gleich aussehenden Glyphe ergänzen (Ziel: vorhandener Codepunkt)
ALIAS = {0x2011: 0x2010}   # geschützter Bindestrich = Bindestrich


def unshare(font):
    """Jeder Codepunkt erhält eine eigene Glyphe. jsPDF schreibt die ToUnicode-Tabelle je Glyphe; teilen sich
    U+0020 und U+00A0 (oder U+2019 und U+02BC) eine Glyphe, kommt beim Kopieren aus dem PDF das falsche Zeichen."""
    cmap = font.getBestCmap()
    glyf, hmtx = font['glyf'], font['hmtx']
    order = list(font.getGlyphOrder())
    add = {}
    by_glyph = {}
    for c, g in sorted(cmap.items()):
        by_glyph.setdefault(g, []).append(c)
    for g, cps in by_glyph.items():
        if len(cps) < 2:
            continue
        keep = next((c for c in cps if c in PRIMARY), cps[0])
        for c in cps:
            if c != keep:
                add[c] = g
    for c, src in ALIAS.items():
        if c not in cmap and src in cmap:
            add[c] = cmap[src]
    for c, g in add.items():
        name = 'uni%04X.sgk' % c
        glyf.glyphs[name] = copy.deepcopy(glyf[g])
        hmtx.metrics[name] = hmtx.metrics[g]
        order.append(name)
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    for t in font['cmap'].tables:
        if t.isUnicode():
            for c in add:
                if t.format == 4 and c > 0xFFFF:
                    continue
                t.cmap[c] = 'uni%04X.sgk' % c
    return add


def make(pkg, file, family, style):
    path = os.path.join(NM, pkg, file)
    font = TTFont(path)
    opts = subset.Options()
    opts.layout_features = []          # jsPDF wertet GSUB/GPOS nicht aus
    opts.hinting = False
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opts.name_languages = [0x409]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    ps = (family.replace(' ', '') + '-' + style)
    full = family + ' ' + style if style != 'Regular' else family
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (1, 4, 6, 16, 17, 3):
            name.removeNames(nameID=rec.nameID)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style if style in ('Regular', 'Italic', 'Bold') else 'Regular', 2, 3, 1, 0x409)
    name.setName(f'{ps};derived from {os.path.basename(file)}', 3, 3, 1, 0x409)
    name.setName(full, 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    unshare(font)
    buf = io.BytesIO()
    font.save(buf)
    raw = buf.getvalue()
    cmap = font.getBestCmap()
    return raw, sorted(cmap.keys())


def main():
    entries, meta = [], {}
    for key, pkg, file, family, style in FONTS:
        raw, cps = make(pkg, file, family, style)
        z = zlib.compress(raw, 9)
        b64 = base64.b64encode(z).decode('ascii')
        missing = [c for c in UNICODES if c not in set(cps)]
        meta[key] = {
            'family': family, 'style': style, 'source': f'@expo-google-fonts/{pkg}/{file}',
            'ttfBytes': len(raw), 'zlibBytes': len(z), 'base64Chars': len(b64), 'glyphCodepoints': len(cps),
            'sha256': hashlib.sha256(raw).hexdigest()[:16],
            'missing': ' '.join('U+%04X' % c for c in missing),
        }
        entries.append(f"  '{key}': '{b64}',")
        print(f"{key:14s} ttf {len(raw):7d}  zlib {len(z):7d}  base64 {len(b64):7d}  cps {len(cps)}  missing {len(missing)}", file=sys.stderr)
    js = ('// GENERIERT von test/export/tools/make-fonts.py — nicht von Hand ändern.\n'
          '// Teilmengen von IBM Plex Serif und IBM Plex Sans (IBM Corp., OFL 1.1, umbenannt wegen reserviertem\n'
          '// Namen «Plex»). Lizenz: src/export/fonts/OFL.txt\n'
          '// Inhalt: TTF, zlib-komprimiert (RFC 1950), base64.\n'
          'export const FONT_META = ' + json.dumps(meta, ensure_ascii=False, indent=1) + ';\n'
          'export const FONT_DATA = {\n' + '\n'.join(entries) + '\n};\n')
    with open(OUT + '.tmp', 'w', encoding='utf-8') as fh:
        fh.write(js)
    os.replace(OUT + '.tmp', OUT)
    print('geschrieben:', OUT, len(js), 'Zeichen', file=sys.stderr)


main()
