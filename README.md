# Stage Reader 2.0

Lokaler, installierbarer Notenleser für **PDF**, **Guitar Pro (GP3, GP4, GP5, GPX, GP)** und **Setlisten**.
Optimiert für **s/w-E-Ink-Tablets** (z. B. BOOX). Alles läuft offline im Browser; Dateien und Einstellungen
liegen nur auf dem jeweiligen Gerät (IndexedDB). Kein Build-Schritt: Die Dateien aus diesem Ordner direkt
auf GitHub Pages veröffentlichen.

## Funktionen

- **E-Ink ist der Standard**: reines Schwarz auf Weiß, kräftige Rahmen, große Tippflächen, keine Animationen,
  kein weiches Scrollen. Noten und Tabulatur werden rein schwarz gezeichnet, PDFs in Graustufen mit mehr Kontrast.
  Umschaltbar auf Hell/Dunkel unter *Einstellungen*.
- **Guitar Pro – bar-genaues Blättern**: Vorwärts tippen zeigt als Nächstes eine Seite, die mit dem Takt beginnt,
  der vorher **unten rechts als letzter sichtbar** war (er steht dann oben links). Zurück nutzt dieselben
  Seitengrenzen. Angezeigt wird immer nur, was komplett auf den Bildschirm passt (keine halb abgeschnittene Zeile).
- **Spurauswahl** (Guitar Pro): im Menü beliebige Spuren an-/abwählen, dazu *Noten / Tabulatur / Beides* und
  *Takte pro Zeile* (Auto oder 1–6). Standard ist die erste Spur.
- **Zoom per Eintippen**: Prozentzahl im Menü eintippen und mit Enter bestätigen (oder Feld verlassen).
  Es wird nichts übernommen, solange du tippst. Dazu − / + (10-%-Schritte) und *Standard*.
  Guitar Pro startet mit 120 %. Bei PDFs bedeutet 100 % „Seite passt komplett ins Fenster“.
- **PDF**: Seite, Halbe Seite (Schrittweite einstellbar) und Endlos; bei vergrößerter Seite blättert Tippen erst
  durch die Seite und dann zur nächsten.
- **Blättern**: links/rechts auf den Bildschirm tippen, Pfeiltasten, Bild auf/ab, Leertaste. Das Menü ist ein
  Overlay und verschiebt das Layout nicht.
- **Bibliothek**: Suche, Favoriten, Sortierung, Umbenennen, Download, Löschen, Drag & Drop.
  Beim Import werden Dateien wirklich geparst; **defekte oder abgeschnittene Dateien werden abgelehnt** und können
  keine funktionierende Datei überschreiben. Bei gleichem Dateinamen: Ersetzen (Favorit, Titel, Setlisten bleiben),
  zusätzlich importieren oder überspringen.
- **Setlisten**: anlegen, Songs hinzufügen, Reihenfolge ändern, starten; im Reader Vorheriger/Nächster Song.
- **Sicherung** (Einstellungen): exportiert Einstellungen, Setlisten und Leseposition als JSON – nicht die
  Notendateien selbst.
- **Übernahme aus Stage Reader 1.0**: Liegt auf derselben Adresse noch die alte Datenbank, erscheint in der
  Bibliothek ein Hinweis zum Übernehmen von Songs und Setlisten.

## Veröffentlichen (GitHub Pages)

Alle Dateien dieses Ordners (außer `tests/`, optional) in das Repository legen, unter
**Settings → Pages → Deploy from a branch → `main` / `(root)`** veröffentlichen.
Alle Pfade sind relativ, es funktioniert auch unter `https://BENUTZER.github.io/REPOSITORY/`.
Der Service Worker cached App und Bibliotheken für die Offline-Nutzung; bei Änderungen in `sw.js` die Konstante
`CACHE` hochzählen.

## Entwicklung

Lokal testen mit einem beliebigen statischen Server (Service Worker und ES-Module brauchen `http://`, nicht `file://`),
z. B. `npx serve .`. Tests der reinen Logik (Zoom-Eingabe, Blätterregel, Sortierung, Backup):

```powershell
node --test tests/logic.test.mjs
```

## Aufbau

```
index.html, manifest.json, sw.js, css/styles.css
js/main.js       Router und Start
js/library.js    Bibliothek          js/setlists.js   Setlisten
js/settings.js   Einstellungen       js/reader.js     Reader (Menü, Tippen, Tastatur)
js/gpview.js     Guitar Pro (alphaTab)   js/pdfview.js    PDF (pdf.js)
js/logic.js      reine Logik (getestet)  js/db.js         IndexedDB
js/files.js, js/importer.js              Dateiprüfung, Import, Übernahme aus 1.0
vendor/          alphaTab 1.8.4 (MPL-2.0), PDF.js 4.10.38 (Apache-2.0), Bravura-Schrift (OFL)
```

## Grenzen

Lautstärketasten und Hardware-Blättertasten kann eine Web-App nicht zuverlässig abfangen. Dauerhafter Speicher
und Bildschirm-wach-halten sind optionale Browserfunktionen. Keine Cloud, kein Audio, kein Playback.
Keine urheberrechtlich geschützten Noten enthalten. Die Lizenztexte der mitgelieferten Bibliotheken liegen unter `vendor/`.
