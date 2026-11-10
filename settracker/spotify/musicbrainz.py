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


def _get(path: str, **params) -> dict | None:
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
    return r.json() if r.status_code == 200 else None


def _tags(obj: dict) -> list[str]:
    tags = [t for t in (obj.get("genres") or []) + (obj.get("tags") or []) if t.get("count", 1) > 0]
    tags.sort(key=lambda t: -t.get("count", 1))
    return list(dict.fromkeys(t["name"].lower() for t in tags))[:8]


def artist_genres(name: str, isrc: str | None = None) -> list[str]:
    """Genre-Tags des Künstlers. Eindeutig über die ISRC eines Tracks, sonst über exakte Namenssuche."""
    name = name.strip()
    if not name:
        return []
    key = f"mb:{name.lower()}"
    cached = db.kv_get(key)
    if cached is not None:
        return cached
    tags: list[str] = []
    if isrc:
        data = _get(f"/isrc/{isrc}", inc="artist-credits")
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
        exact = [a for a in (data or {}).get("artists") or [] if a.get("name", "").lower() == name.lower() and a.get("score", 0) >= 90]
        # Bei Namensgleichheit den Eintrag mit den meisten Tags nehmen (meist der bekannteste)
        exact.sort(key=lambda a: -len(a.get("tags") or []))
        if exact:
            tags = _tags(exact[0])
    db.kv_set(key, tags)
    return tags
