"""Spotify-Tracks in die Bibliothek übernehmen und mit Merkmalen anreichern."""
from __future__ import annotations

import re
import threading

from .. import db
from ..music import genre_family
from . import musicbrainz, reccobeats

_state = {"running": False, "phase": "", "done": 0, "total": 0, "message": ""}
_lock = threading.Lock()


def _norm(text: str) -> str:
    text = re.sub(r"\(.*?\)|\[.*?\]|feat\..*|ft\..*", "", text.lower())
    return re.sub(r"[^a-z0-9]+", "", text)


def find_local_match(item: dict, tracks: list[dict]) -> dict | None:
    """Passende lokale Datei zu einem Spotify-Track (ISRC, sonst Titel + erster Künstler + Dauer)."""
    title, artist = _norm(item["title"]), _norm(item["artist"].split(",")[0])
    for t in tracks:
        if t["source"] != "local":
            continue
        if item.get("isrc") and t.get("isrc") and item["isrc"].upper() == t["isrc"].upper():
            return t
        if _norm(t["title"]) == title and title and (not artist or artist in _norm(t["artist"]) or _norm(t["artist"].split(",")[0]) in artist):
            if not t["duration"] or not item["duration"] or abs(t["duration"] - item["duration"]) < 15:
                return t
    return None


def upsert(items: list[dict], collection: str) -> list[int]:
    """Legt Spotify-Tracks an bzw. verknüpft sie mit vorhandenen lokalen Dateien."""
    existing = db.all_tracks()
    by_sid = {t["spotify_id"]: t for t in existing if t["spotify_id"]}
    ids = []
    for item in items:
        track = by_sid.get(item["spotify_id"]) or find_local_match(item, existing)
        if track:
            if not track["spotify_id"]:
                db.update_track(track["id"], spotify_id=item["spotify_id"], isrc=track.get("isrc") or item.get("isrc"))
            db.add_collection(track["id"], collection)
            ids.append(track["id"])
        else:
            new_id = db.add_track(source="spotify", status="pending", collections=[collection] if collection else [], **item)
            by_sid[item["spotify_id"]] = {"id": new_id, "spotify_id": item["spotify_id"]}
            ids.append(new_id)
    return ids


def enrich_features(track_ids: list[int]) -> int:
    """BPM/Tonart/Energie von ReccoBeats für Spotify-Tracks ohne eigene Analyse."""
    tracks = [t for t in db.get_tracks(track_ids) if t["source"] == "spotify" and t["status"] == "pending" and t["spotify_id"]]
    found = reccobeats.features([t["spotify_id"] for t in tracks])
    for t in tracks:
        fields = found.get(t["spotify_id"])
        if fields:
            db.update_track(t["id"], status="partial", **fields)
        else:
            db.update_track(t["id"], status="error", error="Keine Audio-Merkmale bei ReccoBeats gefunden")
    return len(found)


def enrich_genres(track_ids: list[int], progress=None) -> None:
    """Genre je Track über den ersten Künstler (MusicBrainz) ergänzen."""
    tracks = [t for t in db.get_tracks(track_ids) if not t["genres"] and t["artist"]]
    for n, t in enumerate(tracks):
        if progress:
            progress(n, len(tracks), t["artist"])
        genres = musicbrainz.artist_genres(t["artist"].split(",")[0], t.get("isrc"))
        if genres:
            db.update_track(t["id"], genres=genres, family=genre_family(genres))


def run_import(items: list[dict], collection: str, background: bool = True) -> list[int]:
    """Import + Anreicherung. Genres laufen (langsam, 1 Anfrage/s) im Hintergrund weiter."""
    ids = upsert(items, collection)

    def work() -> None:
        try:
            _state.update(running=True, phase="Audio-Merkmale laden", done=0, total=len(ids), message="")
            enrich_features(ids)
            _state.update(phase="Genres ergänzen")
            enrich_genres(ids, lambda n, total, name: _state.update(done=n, total=total, message=name))
        finally:
            _state.update(running=False, phase="", message="")

    if background:
        with _lock:
            threading.Thread(target=work, daemon=True, name="settracker-spotify").start()
    else:
        work()
    return ids


def run_genres(track_ids: list[int]) -> None:
    """Nur die Genre-Ergänzung im Hintergrund starten."""

    def work() -> None:
        try:
            _state.update(running=True, phase="Genres ergänzen", done=0, total=len(track_ids), message="")
            enrich_genres(track_ids, lambda n, total, name: _state.update(done=n, total=total, message=name))
        finally:
            _state.update(running=False, phase="", message="")

    threading.Thread(target=work, daemon=True, name="settracker-genres").start()


def status() -> dict:
    return dict(_state)
