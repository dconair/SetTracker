"""Genre-Tags je Künstler von MusicBrainz (Spotify liefert keine Genres mehr).

MusicBrainz erlaubt eine Anfrage pro Sekunde; Ergebnisse werden dauerhaft gecacht.
"""
from __future__ import annotations

import threading
import time

import httpx

from .. import db

BASE = "https://musicbrainz.org/ws/2"
HEADERS = {"User-Agent": "SetTracker/0.1 (local DJ set planner)"}
_lock = threading.Lock()
_last = 0.0


RETRY_EMPTY_AFTER = 7 * 24 * 3600  # „nichts gefunden“ nach einer Woche erneut versuchen


def _get(path: str, **params) -> dict | None:
    """Antwort als dict; None bei Netzfehler, Rate-Limit oder Serverfehler (nicht cachen!)."""
    global _last
    with _lock:
        wait = 1.1 - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        try:
            r = httpx.get(f"{BASE}{path}", params={"fmt": "json", **params}, headers=HEADERS, timeout=20)
        except httpx.HTTPError:
            return None
        finally:
            _last = time.time()
    if r.status_code == 404:
        return {}  # eindeutige Antwort: gibt es nicht
    return r.json() if r.status_code == 200 else None


def _tags(obj: dict) -> list[str]:
    tags = [t for t in (obj.get("genres") or []) + (obj.get("tags") or []) if t.get("count", 1) > 0]
    tags.sort(key=lambda t: -t.get("count", 1))
    return list(dict.fromkeys(t["name"].lower() for t in tags))[:8]


def artist_genres(name: str, isrc: str | None = None, force: bool = False) -> list[str]:
    """Genre-Tags des Künstlers. Eindeutig über die ISRC eines Tracks, sonst über exakte Namenssuche.

    Gecacht wird nur, was MusicBrainz wirklich geantwortet hat: Treffer dauerhaft, „nichts gefunden“
    für eine Woche. Netzfehler und Rate-Limits werden nie gespeichert. `force` übergeht leere Einträge.
    """
    name = name.strip()
    if not name:
        return []
    key = f"mb:{name.lower()}"
    cached = db.kv_get(key)
    if isinstance(cached, list):  # Format älterer Versionen: leere Listen waren oft nur Fehler
        cached = {"tags": cached, "t": 0}
    if cached and (cached["tags"] or (not force and time.time() - cached["t"] < RETRY_EMPTY_AFTER)):
        return cached["tags"]

    tags: list[str] = []
    answered = False
    if isrc:
        data = _get(f"/isrc/{isrc}", inc="artist-credits")
        answered = data is not None
        for rec in (data or {}).get("recordings") or []:
            for credit in rec.get("artist-credit") or []:
                artist = credit.get("artist") or {}
                if artist.get("name", "").lower() == name.lower() and artist.get("id"):
                    tags = _tags(_get(f"/artist/{artist['id']}", inc="genres+tags") or {})
                    break
            if tags:
                break
    if not tags:
        escaped = name.replace("\\", " ").replace('"', " ")
        data = _get("/artist", query=f'artist:"{escaped}"', limit=5)
        answered = data is not None  # die Namenssuche entscheidet, ob „nichts gefunden“ belastbar ist
        exact = [a for a in (data or {}).get("artists") or [] if a.get("name", "").lower() == name.lower() and a.get("score", 0) >= 90]
        # Bei Namensgleichheit den Eintrag mit den meisten Tags nehmen (meist der bekannteste)
        exact.sort(key=lambda a: -len(a.get("tags") or []))
        if exact:
            tags = _tags(exact[0])
    if tags or answered:
        db.kv_set(key, {"tags": tags, "t": time.time()})
    return tags
