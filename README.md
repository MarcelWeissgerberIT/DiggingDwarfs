# Digging Dwarfs ⛏️💎

Eine gemütliche, isometrische **Zwergen-Ameisenfarm** für das Handy: Süße kleine Zwerge graben
eigenständig Stollen in eine gläserne Erdscheibe und suchen nach Gold, Kristallen und Diamanten.
Du bist vor allem **Beobachter** – und hast nur wenige Befehle.

**Spielen:** https://marcelweissgerberit.github.io/DiggingDwarfs/

## So funktioniert's

- 👀 Die Zwerge graben von allein – wie Ameisen. Sie bohren Gänge, bauen **Leitern** zum Klettern und
  **Brücken** über Löcher, legen Kammern an, hängen Laternen auf, plaudern und bringen Funde zur Lore.
- 🦖 In der Erde stecken **Dino-Skelette** (T-Rex, Triceratops, Brachiosaurus, Stegosaurus). Die Zwerge
  graben um sie herum und bekommen beim Freilegen einen Gold-Bonus.
- ⬇️ **Endlos tief:** Erde → Lehm → Stein → Tiefgestein → Glutfels → Kristallfels → Obsidian → Zwergenruinen → …
  Jede Schicht braucht eine bessere Spitzhacke, und die Schätze werden immer wertvoller.
- 📯 Höchstens **3 Befehle**, die sich langsam aufladen: 🚩 Grabziel antippen · 🍺 Festmahl (schneller graben).
- 🔨 **Werkstatt:** neue Zwerge anwerben, bessere Spitzhacken kaufen.
- ✋ Ziehen = bewegen, zwei Finger / Mausrad = zoomen, Zwerg antippen = Infos & Folgen, ▶ = Zeitraffer.

Der Spielstand wird automatisch im Browser gespeichert; beim Zurückkehren holen die Zwerge die
verpasste Zeit (bis zu 30 Minuten) nach.

## Technik

- Reines HTML5-Canvas + Vanilla-JavaScript (ES-Module), kein Build-Schritt.
- Eigener isometrischer Renderer: Die Erde ist eine dünne Scheibe hinter Glas; Rückwände, Böden,
  Seitenwände und Vorderflächen werden texturiert in der richtigen Reihenfolge gezeichnet,
  dazu Lichtkarte (Laternen, Leuchtpilze, Edelsteine), Tag/Nacht, Partikel.
- Zwergen-KI mit Dijkstra-Wegsuche (Graben, Leiter- und Brückenbau kosten Zeit, vorhandene Gänge sind billig)
  und ameisenartigem Stollenbau; die Welt wird beim Tiefergraben stückweise nachgeneriert.
- Sounds & Musik werden per WebAudio synthetisiert.
- Zwerge, Dino-Skelette, Requisiten, Gesteinstexturen, Titelbild und App-Icon wurden mit **OpenArt**
  generiert und mit `tools/process_assets.py` freigestellt und zugeschnitten.
- Die Icons (Schätze, Bedienelemente) sind ein eigenes, handgezeichnetes Vektor-Set (`js/icons.js`),
  das sowohl im Canvas als auch in der Oberfläche benutzt wird.

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Deployment

Jeder Push auf `main` wird über `.github/workflows/pages.yml` automatisch auf GitHub Pages veröffentlicht.
