"""Spotify-Tracks in die Bibliothek übernehmen und mit Merkmalen anreichern."""
from __future__ import annotations

import threading

from .. import db
from ..music import genre_family, tempo_check
from . import deezer, musicbrainz, reccobeats
from .match import same_track

_state: dict = {"running": False, "phase": "", "done": 0, "total": 0, "message": "", "result": None}
_lock = threading.Lock()


def find_local_match(item: dict, tracks: list[dict]) -> dict | None:
    """Passende lokale Datei zu einem Spotify-Track."""
    return next((t for t in tracks if t["source"] == "local" and same_track(item, t)), None)


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


def needs_features(t: dict) -> bool:
    return t["source"] == "spotify" and (t.get("bpm") is None or t["status"] in ("pending", "error"))


def enrich_features(track_ids: list[int]) -> int:
    """BPM/Tonart/Energie von ReccoBeats (Sammelabfrage) für Spotify-Tracks ohne Daten."""
    tracks = [t for t in db.get_tracks(track_ids) if needs_features(t) and t["spotify_id"]]
    found = reccobeats.features([t["spotify_id"] for t in tracks])
    for t in tracks:
        fields = found.get(t["spotify_id"])
        if fields and fields.get("bpm"):
            db.update_track(t["id"], status="partial", error=None, data_source="ReccoBeats", **fields)
        else:
            db.update_track(t["id"], status="error", error="Noch keine Audio-Daten gefunden")
    return len(found)


def enrich_one(track_id: int, force: bool = False) -> dict:
    """Zweite Stufe für einen Track: Vorhörclip (BPM/Tonart/Stimmung) und Genres aus mehreren Quellen.

    Liefert, was neu gefunden wurde: {"features": bool, "genres": bool}.
    """
    t = db.get_track(track_id)
    out = {"features": False, "genres": False}
    if not t:
        return out
    hit = None
    if needs_features(t):
        hit = deezer.find(t)
        fields = deezer.preview_features(hit) if hit else None
        if fields:
            db.update_track(track_id, status="partial", error=None, data_source="Vorhörclip (geschätzt)", **fields)
            out["features"] = True
        else:
            db.update_track(track_id, status="error", error="Weder ReccoBeats noch ein Vorhörclip liefern Daten zu diesem Track")
    if not t["genres"] and t["artist"]:
        genres = musicbrainz.artist_genres(t["artist"].split(",")[0], t.get("isrc"), force=force)
        if not genres:
            hit = hit or deezer.find(t)
            genres = deezer.genres(hit) if hit else []
        if genres:
            db.update_track(track_id, genres=genres, family=genre_family(genres))
            out["genres"] = True
    # Schätzwert aus dem Clip mit dem Genre abgleichen: eindeutiges Halb-/Doppeltempo gleich korrigieren
    t = db.get_track(track_id)
    if t and t["data_source"].startswith("Vorhörclip"):
        hint = tempo_check(t["bpm"], t["family"])
        if hint and hint["suggest"]:
            db.update_track(track_id, bpm=hint["suggest"])
    return out


def incomplete(t: dict) -> bool:
    """Fehlt diesem Track etwas, das sich nachschlagen lässt?"""
    return needs_features(t) or (not t["genres"] and bool(t["artist"]))


def enrich(track_ids: list[int], force: bool = False) -> dict:
    """Alle Quellen der Reihe nach; meldet Fortschritt über den Status und zählt das Ergebnis."""
    tracks = [t for t in db.get_tracks(track_ids) if incomplete(t)]
    result = {"checked": len(tracks), "features_found": 0, "genres_found": 0, "still_missing": 0}
    _state.update(phase="Audio-Daten laden", done=0, total=len(tracks), message="ReccoBeats")
    before = {t["id"] for t in tracks if needs_features(t)}
    enrich_features([t["id"] for t in tracks])
    result["features_found"] = sum(1 for t in db.get_tracks(list(before)) if not needs_features(t))
    _state.update(phase="Fehlende Daten nachschlagen")
    for n, t in enumerate(tracks):
        _state.update(done=n, message=f"{t['artist']} – {t['title']}" if t["artist"] else t["title"])
        found = enrich_one(t["id"], force=force)
        result["features_found"] += found["features"]
        result["genres_found"] += found["genres"]
    result["still_missing"] = sum(1 for t in db.get_tracks([t["id"] for t in tracks]) if incomplete(t))
    return result


_jobs = threading.Lock()   # Aufträge laufen nacheinander, nie gleichzeitig
_waiting = 0


def _background(work) -> None:
    """Auftrag im Hintergrund ausführen. Mehrere Aufträge werden der Reihe nach abgearbeitet;
    „läuft“ gilt, bis der letzte fertig ist, und das Ergebnis gehört immer zum zuletzt beendeten."""
    global _waiting
    with _lock:
        _waiting += 1
        _state.update(running=True, result=None)   # sofort sichtbar, nicht erst wenn der Thread anläuft

    def run() -> None:
        global _waiting
        result = None
        try:
            with _jobs:
                result = work()
        finally:
            with _lock:
                _waiting -= 1
                if _waiting == 0:
                    _state.update(running=False, phase="", message="", result=result)

    threading.Thread(target=run, daemon=True, name="settracker-enrich").start()


def run_import(items: list[dict], collection: str, background: bool = True) -> list[int]:
    """Import + Anreicherung. Das Nachschlagen läuft (teils langsam) im Hintergrund weiter."""
    ids = upsert(items, collection)
    if background:
        _background(lambda: enrich(ids))
    else:
        enrich(ids)
    return ids


def run_enrich(track_ids: list[int], force: bool = True) -> None:
    """Nachschlagen auf Knopfdruck im Hintergrund starten."""
    _background(lambda: enrich(track_ids, force=force))


def status() -> dict:
    return dict(_state)
