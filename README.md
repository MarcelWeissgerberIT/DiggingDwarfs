# Digging Dwarfs ⛏️💎

Eine gemütliche, isometrische **Zwergen-Ameisenfarm** für das Handy: Süße kleine Zwerge graben
eigenständig Stollen in eine gläserne Erdscheibe und suchen nach Gold, Kristallen und Diamanten.
Du bist vor allem **Beobachter** – und hast nur wenige Befehle.

**Spielen:** https://marcelweissgerberit.github.io/DiggingDwarfs/

## So funktioniert's

- 👀 Die Zwerge graben von allein – wie Ameisen. Sie bohren Gänge, legen Kammern an, hängen Laternen auf,
  plaudern miteinander und bringen ihre Funde zur Lore an der Oberfläche.
- 📯 Du hast höchstens **3 Befehle** (Hornstöße), die sich langsam wieder aufladen:
  - 🚩 **Graben** – tippe auf eine Stelle, der nächste Zwerg gräbt dorthin.
  - 🍺 **Festmahl** – alle Zwerge kommen an die Tafel und graben danach 2 Minuten schneller.
- ⛏️ **Werkstatt** – mit Gold neue Zwerge anwerben und bessere Spitzhacken kaufen
  (Erde → Lehm → Stein → Tiefgestein → Glutfels).
- 🌙 Tag-/Nachtwechsel: müde Zwerge gehen abends ins Häuschen.
- 💎 Ganz unten im Glutfels liegt das legendäre **Herz des Berges**.
- ✋ Ziehen = bewegen, zwei Finger / Mausrad = zoomen, Zwerg antippen = Infos & Folgen, ⏩ = Zeitraffer.

Der Spielstand wird automatisch im Browser gespeichert; beim Zurückkehren holen die Zwerge die
verpasste Zeit (bis zu 30 Minuten) nach.

## Technik

- Reines HTML5-Canvas + Vanilla-JavaScript (ES-Module), kein Build-Schritt.
- Eigener isometrischer Renderer: Die Erde ist eine dünne Scheibe hinter Glas; Rückwände, Böden,
  Seitenwände und Vorderflächen werden texturiert in der richtigen Reihenfolge gezeichnet,
  dazu Lichtkarte (Laternen, Leuchtpilze, Edelsteine), Tag/Nacht, Partikel.
- Zwergen-KI mit Dijkstra-Wegsuche (Graben kostet Zeit, vorhandene Gänge sind billig) und
  ameisenartigem Stollenbau.
- Sounds & Musik werden per WebAudio synthetisiert.
- Alle Grafiken (Zwerge, Schätze, Requisiten, Texturen, Titelbild, App-Icon) wurden mit
  **OpenArt** generiert und mit `tools/process_assets.py` freigestellt und zugeschnitten.

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Deployment

Jeder Push auf `main` wird über `.github/workflows/pages.yml` automatisch auf GitHub Pages veröffentlicht.
