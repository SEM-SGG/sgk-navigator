# Erzeugt src/app/assets/ui-symbols.js: zwei kleine Zeichenschriften (TTF, base64) für Symbole der Oberfläche,
# die in den eingebetteten Teilmengen von IBM Plex (@fontsource latin/latin-ext) fehlen. Ohne sie fielen Druck und
# «Als PDF speichern» auf Systemschriften zurück.
#
# Aufruf (aus dem Repo-Wurzelverzeichnis):  python3 -I test/app/tools/make-ui-symbols.py
#  - «SGKN Zeichen»: Teilmenge aus IBM Plex Sans 400 (Google-Fonts-TTF aus @expo-google-fonts/ibm-plex-sans, SIL OFL 1.1).
#    Umbenannt, weil «Plex» ein reservierter Schriftname ist (OFL Ziff. 3); Copyright und Lizenz (name ID 0, 13, 14) bleiben.
#  - «SGKN Symbole»: Teilmenge aus DejaVu Sans (/usr/share/fonts/truetype/dejavu; Bitstream-Vera-Lizenz mit
#    DejaVu-Änderungen gemeinfrei). Umbenannt, weil geänderte Fassungen die Namen «Bitstream» und «Vera» nicht tragen dürfen.
import base64, io, os
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.getcwd()
PLEX = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'ibm-plex-sans', '400Regular', 'IBMPlexSans_400Regular.ttf')
DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
OUT = os.path.join(ROOT, 'src', 'app', 'assets', 'ui-symbols.js')

PLEX_CHARS = '✓≈→↗←'
SYM_CHARS = '○●■□▲▼►✕✗✎◆◇'


def make(src, chars, family):
    f = TTFont(src)
    cm = f.getBestCmap()
    uni = [ord(c) for c in chars if ord(c) in cm]
    missing = [c for c in chars if ord(c) not in cm]
    if missing:
        raise SystemExit(f'{family}: fehlende Zeichen {missing}')
    opt = subset.Options()
    opt.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    opt.notdef_outline = True
    opt.layout_features = []
    opt.hinting = False
    sub = subset.Subsetter(opt)
    sub.populate(unicodes=uni)
    sub.subset(f)
    ps = family.replace(' ', '')
    for rec in f['name'].names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID in (2, 17):
            rec.string = 'Regular'
        elif rec.nameID == 4:
            rec.string = family + ' Regular'
        elif rec.nameID == 6:
            rec.string = ps + '-Regular'
        elif rec.nameID == 3:
            rec.string = ps + '-Regular;subset'
    buf = io.BytesIO()
    f.save(buf)
    return base64.b64encode(buf.getvalue()).decode('ascii'), ''.join(chr(u) for u in uni)


zeichen, zc = make(PLEX, PLEX_CHARS, 'SGKN Zeichen')
symbole, sc = make(DEJAVU, SYM_CHARS, 'SGKN Symbole')
with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('// Erzeugt von test/app/tools/make-ui-symbols.py, nicht von Hand ändern.\n')
    fh.write(f'// SGKN Zeichen ({zc}) aus IBM Plex Sans (SIL OFL 1.1); SGKN Symbole ({sc}) aus DejaVu Sans (Bitstream-Vera-Lizenz).\n')
    fh.write(f"export const ZEICHEN = '{zeichen}';\n")
    fh.write(f"export const SYMBOLE = '{symbole}';\n")
print('geschrieben', OUT, len(zeichen) + len(symbole), 'Zeichen base64')
