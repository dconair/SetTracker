# SetTracker

DJ-Set-Planer für den Browser: Tracks sichten, Set-Listen nach Genre, BPM, Tonart, Stimmung und
Waveform zusammenstellen, bestehende Playlists prüfen und Übergänge mit Schritt-für-Schritt-Anleitung
für den **Pioneer DDJ-FLX4** (rekordbox) planen. Läuft lokal auf deinem Rechner.

## Was es kann

- **Bibliothek** – Musikordner analysieren (BPM, Beatgrid, Tonart als Camelot-Code, Energie, Stimmung,
  Intro/Break/Outro, Dreiband-Waveform) und Spotify-Playlists bzw. Lieblingssongs importieren.
  Filter nach Genre-Familie (erst nur House, dann Drum & Bass …), BPM-Bereich, Quelle, Playlist; Volltextsuche.
- **Set-Builder** – Tracks per Drag & Drop ordnen. Jeder Übergang bekommt eine Wertung (0–100) mit Begründung;
  „Auto-Sortieren“ optimiert die Reihenfolge entlang einer Energiekurve, angepinnte Tracks bleiben stehen.
- **Smart Shuffle** – schlägt passende nächste Tracks aus der Bibliothek vor (oder für eine Lücke zwischen
  zwei Tracks) und unter „Entdecken“ ähnliche Tracks, die du noch nicht hast.
- **Playlist-Check** – bewertet eine fertige Playlist (Spotify, M3U, rekordbox-XML oder ein Set) Song für Song,
  zeigt einen Umbau-Vorschlag im Vorher/Nachher-Vergleich und Einzel-Eingriffe (tauschen, Brücken-Track,
  Ausreißer entfernen). Das Original wird nie überschrieben.
- **Übergänge** – wählt je Paar eine Übergangsart (Blend, Rise, Fade, Bass-Swap, Echo-Out, Loop-Out, Cut,
  Smart Fader), markiert Mix-Out/Mix-In in den Waveforms und führt Schritt für Schritt durch die Handgriffe:
  Ein Schema des FLX4 hebt je Schritt die Regler und Tasten hervor.
- **Export** – Spotify-Playlist, rekordbox-XML (Beatgrid + Hot Cues MIX IN / DROP / BASS SWAP / MIX OUT),
  M3U und ein druckbarer Spickzettel.

## Installation

### Mit Installer (macOS, Windows)

Die fertigen Installer liegen im Repository unter **Releases**. Einen neuen Stand baust du unter
**Actions → „Installer bauen“ → Run workflow**; trägst du dabei eine Version ein (z. B. `0.3`), entsteht
daraus ein neues Release (ein vorhandenes bekommt die Installer angehängt), sonst liegen die Dateien nur als „Artifacts“ am Lauf.

| System | Datei | Installation |
|---|---|---|
| Mac mit Apple-Chip (M1 oder neuer) | `SetTracker-macOS-AppleSilicon.dmg` | öffnen, SetTracker auf „Programme“ ziehen |
| Windows 10/11 | `SetTracker-Setup.exe` | ausführen, keine Administratorrechte nötig |

Für Macs mit Intel-Prozessor gibt es keinen Installer (eine der Audio-Bibliotheken bietet dafür keine
fertigen Pakete mehr); dort funktioniert der Weg über Python weiter unten.

Die Installer sind **nicht signiert** (dafür wären kostenpflichtige Entwicklerzertifikate nötig), deshalb
warnt das System beim ersten Start:

- **macOS:** Nach dem ersten Startversuch *Systemeinstellungen → Datenschutz & Sicherheit* öffnen und bei
  „SetTracker wurde blockiert“ auf **Dennoch öffnen** klicken.
- **Windows:** Im SmartScreen-Fenster **Weitere Informationen → Trotzdem ausführen**.

SetTracker öffnet sich in einem eigenen Programmfenster; das Fenster zu schließen beendet die App. Lässt
sich das Fenster auf einem Rechner nicht öffnen (z. B. fehlendes WebView2 unter Windows), startet die App
stattdessen im Standardbrowser unter http://127.0.0.1:8000 und wird dort über **Beenden** in der Seitenleiste
geschlossen; der Grund steht dann in `settracker.log` im Ordner `.settracker`. Die Spotify-Anmeldung und der
Spickzettel öffnen sich immer im Standardbrowser.
Der erste Start und die erste Analyse dauern etwas länger. MP3, WAV, FLAC, OGG und AIFF funktionieren ohne
Zusatzsoftware; für M4A/AAC muss [ffmpeg](https://ffmpeg.org/download.html) installiert sein.

### Mit Python (alle Systeme)

Voraussetzung: Python 3.10 oder neuer.

```bash
git clone https://github.com/dconair/SetTracker.git
```

```bash
cd SetTracker
```

```bash
pip install .
```

```bash
settracker
```

So läuft die App im Browser. Für das eigene Programmfenster zusätzlich `pip install ".[desktop]"` und mit
`settracker --window` starten.

Daten (Datenbank, Spotify-Zugang, Logdatei) liegen in beiden Fällen im Ordner `.settracker` in deinem
Benutzerordner. Zum Ausprobieren ohne eigene Musik: in der leeren Bibliothek „Demo-Tracks laden“.

## Spotify einrichten

Die Zugangsdaten gelten pro Rechner – was in einer Cloud-Umgebung hinterlegt ist, kennt die App auf deinem
Computer nicht. Alles läuft in der App: **Bibliothek → Spotify importieren**.

1. Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) eine App anlegen
   (Spotify Premium erforderlich), „Web API“ ankreuzen und als Redirect URI exakt
   `http://127.0.0.1:8000/callback` eintragen.
2. Client ID und Client Secret in den Dialog einfügen und speichern.
3. „Mit Spotify anmelden“ und den Zugriff bestätigen.

Klappt etwas nicht, zeigt **Verbindung prüfen** im selben Dialog Schritt für Schritt, woran es liegt
(Zugangsdaten, Redirect URI, Freischaltung des Kontos unter „User Management“, Premium).

Gut zu wissen:

- Spotify gibt Apps keine BPM-, Tonart-, Genre- oder Strukturdaten und kein Audio mehr. SetTracker fragt
  deshalb der Reihe nach andere Quellen ab: [ReccoBeats](https://reccobeats.com) für BPM, Tonart, Energie und
  Stimmung; kennt ReccoBeats den Track nicht, schätzt die eigene Analyse diese Werte aus dem
  30-Sekunden-Vorhörclip von [Deezer](https://developers.deezer.com/api) (der Clip wird dafür kurz geladen und
  sofort wieder gelöscht). Genres kommen über den Künstler von [MusicBrainz](https://musicbrainz.org), sonst
  vom Album bei Deezer.
- Werte aus dem Vorhörclip sind **Schätzungen aus einem Ausschnitt** und in der App mit „~“ markiert; sie können
  danebenliegen, vor allem bei Drum & Bass oder wenn der Ausschnitt ein Break ist. Passt ein Tempo nicht zum
  Genre, warnt die App und schlägt bei Halb-/Doppeltempo die Korrektur vor.
- **Daten ergänzen** in der Bibliothek schlägt alles Fehlende nach und meldet am Ende, was gefunden wurde.
  In den Track-Details lässt sich ein einzelner Track **erneut suchen** und BPM, Tonart und Genre **von Hand
  korrigieren** (mit „×2“ / „÷2“).
- **Sets lassen sich komplett aus Spotify-Tracks bauen** – Wertung, Reihenfolge, Smart Shuffle, Übergangsart
  und die Anleitung am Controller-Schema funktionieren. Was dabei fehlt: Waveform, erkannte Phasen
  (Intro/Drop/Break/Outro) und taktgenaue Mix-Punkte gibt es nur für lokale Audiodateien. Für Spotify-Tracks
  sind Zeitangaben und Hot Cues ein geschätztes 16-Takt-Raster zum Nachjustieren nach Gehör.
  Liegt ein Track lokal *und* in einer importierten Playlist, verknüpft SetTracker beide automatisch.
- Audio aus Spotify herunterzuladen ist nicht möglich und nicht vorgesehen.

## Empfohlener Ablauf: erst in Spotify planen, dann mit Dateien fertigstellen

1. **Playlist in Spotify bauen** und unter *Playlist-Check → Spotify-Playlist* laden. SetTracker zeigt die
   Wertung jedes Übergangs, den **Stimmungsverlauf** und eine Liste der **Auffälligkeiten**: Tempo-Ausreißer,
   Temposprünge, Tonart-Clashs, Stimmungsbrüche, Energie-Löcher, Genre-Ausreißer, Tracks ohne Daten.
2. **Umbau-Vorschlag ansehen.** Der Schwerpunkt ist wählbar – flüssige Übergänge, ausgewogen oder
   Stimmungsverlauf. Übernimm ihn als neues Set oder ändere die Playlist in Spotify und klicke
   **Aus Spotify aktualisieren**: Dasselbe Set wird neu geladen und erneut geprüft.
3. **Sehen, was fehlt.** Im Set steht „x von y Tracks als Datei vorhanden“; die fehlenden Titel lassen sich
   kopieren oder als CSV speichern. Die Dateien besorgst du selbst – SetTracker lädt nichts herunter.
4. **Ordner mit den Dateien hinzufügen.** Passende Dateien werden dem Spotify-Eintrag automatisch zugeordnet
   (gleiche ISRC oder gleicher Titel, Künstler und ähnliche Länge), der Track bleibt an seinem Platz im Set
   und wird taktgenau analysiert. Passt ein Dateiname nicht, hilft in den Track-Details
   „Vorhandene Datei von Hand zuordnen“; eine falsche Zuordnung lässt sich dort wieder lösen.
5. **Exportieren.** Sind alle Tracks als Datei da, stimmen Hot Cues, Loops und Mix-Punkte taktgenau –
   rekordbox-XML und Spickzettel exportieren.

## Übergänge im Detail

Jeder Übergang ist als **Regler-Automation pro Takt** hinterlegt: Lautstärke, die drei EQ-Bänder, Filter und
Effekte beider Decks. Daraus entstehen Schritt-Texte, Diagramm, Controller-Animation und Hörvorschau – sie
zeigen deshalb immer dasselbe. Die Vorlagen orientieren sich an den Bausteinen von Spotifys Mix-Funktion
(Lautstärke-, EQ- und Effektkurven), sind aber so gebaut, dass sie am DDJ-FLX4 von Hand spielbar sind:

| Vorlage | Ablauf | Wann |
|---|---|---|
| **Blend** | Höhen, Mitten und Bass wechseln nacheinander über 16–32 Takte | lange Outros/Intros, passende Tonart |
| **Rise** | B kommt über den Filter herein, Bass-Tausch auf der Phrasengrenze, A läuft dünn aus | 8–16 Takte Überlappung |
| **Fade** | Crossfade über 4–8 Takte mit Bass-Tausch in der Mitte | kurze Überlappung |
| **Bass-Swap** | Zwei-Band-Klassiker: gemeinsam laufen, Bass in einem Schlag tauschen | wie Blend, einfacher |
| **Echo-Out / Loop-Out / Cut / Smart Fader** | für Tonart-Clash, fehlendes Outro, harte Wechsel, große Temposprünge | |

In der Übergangs-Ansicht liegen beide Waveforms, die Reglerspuren und der Zeiger auf **einer Taktachse**. Die
Regler im Controller-Schema stehen so, wie sie zum gezeigten Takt stehen sollen, und jeder Schritt nennt Takt,
Reglerstellung („LOW von 12 auf 7 Uhr“) und den Grund. Liegen beide Tracks als Audiodatei vor, spielt
**Übergang anhören** den geplanten Übergang mit deinen Dateien ab – mit EQ, Filter und Fadern wie geplant.
Die Vorschau ist eine Annäherung im Browser (Tempo von B wird angeglichen, Echo vereinfacht); maßgeblich
bleibt, wie es am Controller klingt.

## Hot Cues, Loops und Phasen

Ein Klick auf einen Titel öffnet die Track-Details: Waveform mit beschrifteten Phasen und die Belegung der
acht Performance-Pads.

| Pad | Inhalt |
|---|---|
| 1 | INTRO bzw. START – im Set: MIX IN |
| 2 | DROP (Beginn des ersten Hauptteils) |
| 3 | BREAK |
| 4 | DROP 2 (Hauptteil nach dem Break) |
| 5 | LOOP INTRO – 4-Takt-Loop zum Verlängern beim Reinmixen |
| 6 | LOOP OUTRO – 4-Takt-Loop, hält den Beat beim Rausmixen |
| 7 | BASS SWAP (nur im Set, je nach Übergang) |
| 8 | OUTRO – im Set: MIX OUT |

Der rekordbox-Export schreibt Hot Cues und Loops in die XML, alle Phasen zusätzlich als beschriftete
Memory Cues. Die Phasen-Erkennung arbeitet über Energie- und Bassverlauf je Takt; bei Tracks ohne klare
Struktur bitte in rekordbox gegenprüfen.

In der Set-Liste trägt jeder Track einen **Phasen-Streifen** (Intro, Hauptteil, Break, Outro). Bei lokalen
Dateien stammt er aus der Analyse. Bei reinen Spotify-Tracks gibt es kein Audio zum Auswerten – dort zeigt
SetTracker ein **geschätztes Raster in 16-Takt-Blöcken** aus Tempo und Länge (gestrichelt, als „geschätzt“
markiert) und schlägt die Cue-Punkte danach vor. Sobald du die Datei nachlädst, ersetzt die echte Analyse
die Schätzung.

## Lernen

Der Bereich **Lernen** funktioniert ohne angeschlossenen Controller:

- **Takte & Phrasen zählen** – zuerst eine **selbstlaufende Einführung** (ca. 80 Sekunden, langsamer Beat:
  Schläge, Takte, Phrase, selbst zählen), dann üben mit einem **Track aus deiner Bibliothek** (lokale Datei: gezählt wird über
  sein Beatgrid, mit Sprung „8 Takte vor dem Drop“ und Raster-Korrektur) oder einem Übungs-Beat mit einstellbarem Tempo, Zählfelder und eine Phrasen-Uhr
  (8 Takte = 32 Schläge). In der Übung drückst du die Leertaste auf die Eins einer neuen Phrase und siehst,
  wie genau du getroffen hast. Dazu: ein Vergleich „auf der Eins gestartet / daneben“ und der typische
  Bauplan eines Tracks mit den zugehörigen Pads.
- **Übergänge** – jede Übergangsart mit Einsatzgebiet, Hörtipps und typischen Fehlern. Der Trainer startet
  im Modus **Tutorial**: Es läuft von selbst ab – erst die Ansage, dann die sichtbare Bewegung, dann der
  Grund. Die Ansicht fährt auf die betroffenen Regler, Pfeile zeigen die Richtung, die Beschriftung Start-
  und Zielstellung („12 Uhr → 7 Uhr“). Pause mit der Leertaste, Tempo *Langsam / Normal / Zügig*, jeder
  Schritt ist anklickbar, auf Wunsch liest die Sprachausgabe des Systems die Schritte vor. Weitere Modi:
  *Im Takt* (Beat läuft, Schritte werden im passenden Takt aktiv; auch in halbem Tempo), *Selbst probieren*
  (die richtigen Regler anklicken) und *Nachlesen*.
- **Tonarten** – das Camelot-Rad zum Anklicken: welche Tonarten zur gewählten passen.
- **Controller** – ein **Rundgang**, der alle Bedienelemente des DDJ-FLX4 der Reihe nach anfährt und
  erklärt; jedes lässt sich auch einzeln anklicken. **Tipps** – kurze Regeln fürs Üben und Mixen.

Derselbe Trainer steht bei jedem Übergang im Set zur Verfügung, dort mit den Zeitmarken deiner Tracks.
Das Controller-Schema ist eine vereinfachte Draufsicht; der Übungs-Beat kommt aus dem Browser-Synthesizer.

## Darstellung

Unter **Darstellung** in der Seitenleiste: sechs Designs (Studio, Mitternacht, Club, Vinyl, Papier, Sand),
sechs Akzentfarben und vier Farbschemata für die Waveform. Die Auswahl wird im Browser gespeichert.

## Mit rekordbox und dem DDJ-FLX4 nutzen

- **Spotify-Weg:** Set → Export → „Als Spotify-Playlist anlegen“. In rekordbox (Spotify Premium verbunden)
  erscheint die Playlist unter „Spotify“ und lässt sich direkt auf die Decks laden.
- **Datei-Weg:** Set → Export → „rekordbox-XML“. In rekordbox unter *Einstellungen → Erweitert → Datenbank →
  rekordbox xml* die Datei auswählen, dann links im Baum unter „rekordbox xml“ die Playlist per Rechtsklick
  importieren. Die Pad-Belegung steht oben unter „Hot Cues, Loops und Phasen“.
  Tracks, die schon mit eigenem Beatgrid in deiner rekordbox-Sammlung sind, behalten dort ihr Grid.
- Den **Spickzettel** (Export) neben den Controller legen oder im Browser als PDF drucken.

## Wie die Wertung entsteht

| Merkmal | Gewicht | Was gut ist |
|---|---|---|
| Tempo | 30 % | ≤ 2 % Abstand ideal, bis 6 % im Standard-Pitchbereich des FLX4; Halb-/Doppeltempo wird erkannt |
| Tonart | 25 % | gleiche Tonart, Nachbarn auf dem Camelot-Rad, Dur/Moll-Parallele |
| Energie & Stimmung | 15 % | kleine Schritte statt Sprünge |
| Genre | 15 % | gleiche oder verwandte Genre-Familie |
| Waveform | 15 % | genug Outro/Intro zum Überblenden, keine Bass-Überlagerung, ähnliche Lautheit |

Unbekannte Merkmale (z. B. Waveform bei Spotify-Tracks) werden ausgelassen statt geraten. Energie und
Stimmung lokaler Dateien sind Schätzwerte aus Lautheit, Klangfarbe und Tonart.

## Entwicklung

```bash
pip install -e ".[dev]"
```

```bash
pytest
```

Die Oberfläche (React + TypeScript + Tailwind) liegt in `frontend/`; der fertige Build ist unter
`settracker/static/` eingecheckt, damit die App ohne Node.js läuft. Nach Änderungen an der Oberfläche:

```bash
cd frontend && npm ci && npm run build
```

Aufbau: `settracker/analysis` (Audio-Analyse), `settracker/engine` (Wertung, Reihenfolge, Vorschläge,
Übergänge, FLX4-Schritte, Playlist-Check), `settracker/spotify` (Spotify, ReccoBeats, MusicBrainz),
`settracker/export` (rekordbox-XML, M3U, Spickzettel), `settracker/app.py` (API), `packaging/` und
`.github/workflows/installer.yml` (Installer).
