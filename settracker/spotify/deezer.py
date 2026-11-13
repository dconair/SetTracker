"""Deezer als zweite Quelle für Tracks, die ReccoBeats bzw. MusicBrainz nicht kennen.

Die offene Deezer-API (ohne Schlüssel) findet Tracks per ISRC oder Suche und liefert Album-Genres
sowie einen 30-Sekunden-Vorhörclip. Aus dem Clip schätzt die eigene Analyse BPM, Tonart, Energie
und Stimmung. Der Clip wird nur für die Auswertung kurz abgelegt und danach sofort gelöscht.
"""
from __future__ import annotations

import os
import tempfile

import httpx

from .match import same_track

BASE = "https://api.deezer.com"


def _get(path: str, **params) -> dict | None:
    try:
        r = httpx.get(f"{BASE}{path}", params=params, timeout=20)
        data = r.json() if r.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None
    return None if not isinstance(data, dict) or data.get("error") else data


def find(track: dict) -> dict | None:
    """Passender Deezer-Track: über die ISRC, sonst über Künstler + Titel mit Dauerabgleich."""
    if track.get("isrc"):
        hit = _get(f"/track/isrc:{track['isrc']}")
        if hit and hit.get("id"):
            return hit
    artist = (track.get("artist") or "").split(",")[0].strip()
    title = track.get("title") or ""
    for query in (f'artist:"{artist}" track:"{title}"' if artist else "", f"{artist} {title}".strip()):
        if not query:
            continue
        for item in (_get("/search", q=query, limit=5) or {}).get("data") or []:
            cand = {"title": item.get("title"), "artist": (item.get("artist") or {}).get("name"), "duration": item.get("duration")}
            if same_track(track, cand):
                return item
    return None


def genres(hit: dict) -> list[str]:
    album_id = (hit.get("album") or {}).get("id")
    album = _get(f"/album/{album_id}") if album_id else None
    return [g["name"].lower() for g in ((album or {}).get("genres") or {}).get("data") or [] if g.get("name")]


def preview_features(hit: dict) -> dict | None:
    """BPM, Tonart, Energie und Stimmung aus dem 30-Sekunden-Vorhörclip (Schätzwerte)."""
    url = hit.get("preview")
    if not url:
        return None
    try:
        r = httpx.get(url, timeout=30, follow_redirects=True)
        if r.status_code != 200 or len(r.content) < 50_000:
            return None
        from ..analysis import features

        # Die Audiobibliothek erkennt MP3 nur an einer echten Datei: kurz ablegen, auswerten, löschen.
        with tempfile.TemporaryDirectory(prefix="settracker-clip-") as tmp:
            clip = os.path.join(tmp, "clip.mp3")
            with open(clip, "wb") as f:
                f.write(r.content)
            sig = features.load(clip)
        grid = features.beatgrid(sig)
        camelot = features.detect_key(sig)
        return {"bpm": grid["bpm"], "camelot": camelot, **features.mood(sig, grid["bpm"], camelot)}
    except Exception:  # Clip nicht lesbar oder zu kurz – dann eben keine Daten aus dieser Quelle
        return None
