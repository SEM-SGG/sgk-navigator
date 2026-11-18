# LibreOffice (UNO): Änderungsverfolgung in .docx-Dateien prüfen.
# Für jede Datei: Anzahl erkannter Überarbeitungen (Redlines, nach Art), Text nach «Alle annehmen» und nach «Alle ablehnen»
# (Bearbeiten > Änderungen verfolgen > Verwalten; Dispatch-Befehle .uno:AcceptAllTrackedChanges / .uno:RejectAllTrackedChanges).
# Ausgabe: JSON auf stdout  { "<datei>": { "redlines": n, "types": {...}, "accepted": "...", "rejected": "..." } }
#
# Aufruf: /usr/bin/python3 -I test/export/tools/lo-revisions.py <datei.docx> …   (Python mit UNO-Anbindung von LibreOffice)
import json, os, shutil, subprocess, sys, time, uuid

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


def text_of(doc):
    # Absätze in Dokumentreihenfolge, Tabellen zellenweise (wie der Textexport)
    out = []

    def walk(enum_access):
        en = enum_access.createEnumeration()
        while en.hasMoreElements():
            el = en.nextElement()
            if el.supportsService('com.sun.star.text.Paragraph'):
                out.append(el.getString())
            elif el.supportsService('com.sun.star.text.TextTable'):
                for name in el.getCellNames():
                    walk(el.getCellByName(name).getText())

    walk(doc.getText())
    return '\n'.join(out)


def main(files):
    port = 20000 + (os.getpid() % 20000)
    profile = 'file:///tmp/sgk-export-lo-uno-' + uuid.uuid4().hex[:8]
    proc = subprocess.Popen(['soffice', '-env:UserInstallation=' + profile, '--headless', '--invisible', '--norestore', '--nolockcheck',
                             f'--accept=socket,host=127.0.0.1,port={port};urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        ctx = None
        for _ in range(120):
            try:
                ctx = resolver.resolve(f'uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext')
                break
            except Exception:
                time.sleep(0.5)
        if ctx is None:
            raise RuntimeError('LibreOffice nicht erreichbar')
        smgr = ctx.ServiceManager
        desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        dispatcher = smgr.createInstanceWithContext('com.sun.star.frame.DispatchHelper', ctx)
        result = {}
        for f in files:
            url = uno.systemPathToFileUrl(os.path.abspath(f))
            entry = {}
            for action in ('accept', 'reject'):
                doc = desktop.loadComponentFromURL(url, '_blank', 0, (prop('Hidden', True),))
                reds = doc.getRedlines()
                types = {}
                en = reds.createEnumeration()
                n = 0
                while en.hasMoreElements():
                    r = en.nextElement()
                    t = r.getPropertyValue('RedlineType')
                    types[t] = types.get(t, 0) + 1
                    n += 1
                    if action == 'accept' and 'author' not in entry:
                        entry['author'] = r.getPropertyValue('RedlineAuthor')
                        d = r.getPropertyValue('RedlineDateTime')
                        entry['date'] = '%04d-%02d-%02d' % (d.Year, d.Month, d.Day)
                entry['redlines'] = n
                entry['types'] = types
                frame = doc.getCurrentController().getFrame()
                dispatcher.executeDispatch(frame, '.uno:AcceptAllTrackedChanges' if action == 'accept' else '.uno:RejectAllTrackedChanges', '', 0, ())
                entry['accepted' if action == 'accept' else 'rejected'] = text_of(doc)
                entry['remaining_' + action] = doc.getRedlines().createEnumeration().hasMoreElements()
                doc.close(True)
            result[os.path.basename(f)] = entry
        print(json.dumps(result, ensure_ascii=False))
    finally:
        try:
            desktop.terminate()
        except Exception:
            pass
        proc.terminate()
        try:
            proc.wait(10)
        except Exception:
            proc.kill()
        shutil.rmtree(uno.fileUrlToSystemPath(profile), ignore_errors=True)


main(sys.argv[1:])
