# Tag

Tags zeigen einen Status oder eine Klassifikation in Worten; die Farbe verstärkt das Wort, sie ersetzt es nie.

**Der Konsument liefert:** den Text (Kleinschreibung wie im Satz), die Variante und optional ein 12-px-Icon.

| Bedeutung | Klasse | Farben |
| --- | --- | --- |
| anwendbar | `ui-tag--success` | `success-text` auf `success-bg` |
| beschlossen, noch nicht anwendbar; Beispiel | `ui-tag--pending` | `pending-text` auf `pending-bg` |
| Vorschlag, Quelle neutral | `ui-tag` | `ink-muted` auf `surface-1` |
| konsolidiert, ersetzt, Info | `ui-tag--info` | `info-text` auf `highlight` |
| rekonstruiert, Priorität | `ui-tag--outline` | `ink-muted`, Haarlinie |
| LIMITE, Fehler | `ui-tag--error` | `error-text` auf `error-bg`, Schloss-Icon |
| eingefügt, gestrichen | `ui-tag--ins`, `ui-tag--del` | Diff-Farben |
| Haltung CH | `ui-tag--support`, `--with-changes`, `--scrutiny`, `--reservation`, `--oppose`, `--none` | `stance-*` |

- Höhe 24 px, Ecken `radius-xs`, Schrift `label`.
- Nie mehr als drei Tags hintereinander; sonst eine Tabelle verwenden.

## Im Tool

Ersetzt `.chip`, `.chip-pending`, `.badge`, `.nc-limite`, `.ns-*`, `.nd-accepted`/`.nd-partly`/`.nd-rejected`. Entscheidstatus: angenommen = `success`, teilweise angenommen = `with-changes`, abgelehnt = `oppose`, zur Kenntnis genommen = neutral, offen = `outline`.
