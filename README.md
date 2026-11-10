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
- **Übergänge** – wählt je Paar eine Übergangsart (Bass-Swap-Blend, Filter-Fade, Echo-Out, Loop-Out, Cut,
  Smart Fader), markiert Mix-Out/Mix-In in den Waveforms und nennt die Handgriffe am FLX4.
- **Export** – Spotify-Playlist, rekordbox-XML (Beatgrid + Hot Cues MIX IN / DROP / BASS SWAP / MIX OUT),
  M3U und ein druckbarer Spickzettel.

## Installation

Voraussetzung: Python 3.10 oder neuer. (Für MP3/M4A zusätzlich [ffmpeg](https://ffmpeg.org/download.html).)

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

Die App öffnet sich unter http://127.0.0.1:8000. Daten (Datenbank, Spotify-Login) liegen in `~/.settracker`.
Zum Ausprobieren ohne eigene Musik: in der leeren Bibliothek „Demo-Tracks laden“.

## Spotify einrichten

1. Im [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) eine App anlegen
   (Spotify Premium erforderlich) und als Redirect URI exakt `http://127.0.0.1:8000/callback` eintragen.
2. `.env.example` nach `.env` kopieren, Client ID und Client Secret eintragen, SetTracker neu starten.
3. In der Bibliothek „Spotify importieren“ → „Mit Spotify anmelden“.

Gut zu wissen:

- Spotify gibt Apps keine BPM-, Tonart- oder Genre-Daten und kein Audio mehr. SetTracker holt BPM, Tonart,
  Energie und Stimmung deshalb von [ReccoBeats](https://reccobeats.com) und Genres über den Künstler von
  [MusicBrainz](https://musicbrainz.org) (eine Anfrage pro Sekunde – große Bibliotheken brauchen etwas).
  Nicht jeder Track ist dort bekannt; Genres lassen sich in der Bibliothek auch von Hand setzen.
- **Waveform, Beatgrid und taktgenaue Mix-Punkte gibt es nur für lokale Audiodateien.** Für reine
  Spotify-Tracks sind die Übergangs-Anleitungen allgemein gehalten. Liegt ein Track lokal *und* in einer
  importierten Playlist, verknüpft SetTracker beide automatisch.
- Audio aus Spotify herunterzuladen ist nicht möglich und nicht vorgesehen.

## Mit rekordbox und dem DDJ-FLX4 nutzen

- **Spotify-Weg:** Set → Export → „Als Spotify-Playlist anlegen“. In rekordbox (Spotify Premium verbunden)
  erscheint die Playlist unter „Spotify“ und lässt sich direkt auf die Decks laden.
- **Datei-Weg:** Set → Export → „rekordbox-XML“. In rekordbox unter *Einstellungen → Erweitert → Datenbank →
  rekordbox xml* die Datei auswählen, dann links im Baum unter „rekordbox xml“ die Playlist per Rechtsklick
  importieren. Die Hot Cues liegen auf den Pads 1 (MIX IN), 2 (DROP), 7 (BASS SWAP) und 8 (MIX OUT).
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
`settracker/export` (rekordbox-XML, M3U, Spickzettel), `settracker/app.py` (API).
