"""Lokale Bibliothek: Ordner scannen, Tags lesen, Analyse im Hintergrund."""
from __future__ import annotations

import queue
import re
import threading
from pathlib import Path

from . import config, db
from .music import genre_family

_queue: "queue.Queue[int]" = queue.Queue()
_worker: threading.Thread | None = None
_lock = threading.Lock()
_state = {"total": 0, "done": 0, "current": ""}


def read_tags(path: Path) -> dict:
    """Titel, Künstler, Album, Genre aus den Datei-Tags (Fallback: Dateiname „Künstler - Titel“)."""
    tags: dict = {}
    try:
        import mutagen

        f = mutagen.File(path, easy=True)
        if f is not None:
            for key in ("title", "artist", "album", "genre", "isrc"):
                val = f.get(key)
                if val:
                    tags[key] = str(val[0]).strip()
            if f.info and getattr(f.info, "length", 0):
                tags["duration"] = float(f.info.length)
    except Exception:
        pass
    if not tags.get("title"):
        m = re.match(r"^\s*(?:\d+[\s.\-_]+)?(.+?)\s+-\s+(.+)$", path.stem)
        if m:
            tags.setdefault("artist", m.group(1).strip())
            tags["title"] = m.group(2).strip()
        else:
            tags["title"] = path.stem
    return tags


def split_genres(text: str | None) -> list[str]:
    return [g.strip() for g in re.split(r"[;,/|]", text or "") if g.strip()]


def add_file(path: Path, collection: str = "", genre_hint: str = "") -> tuple[int, bool]:
    """Datei in die Bibliothek aufnehmen. Liefert (Track-ID, neu?)."""
    path = path.resolve()
    existing = db.find_track(path=str(path))
    if existing:
        db.add_collection(existing["id"], collection)
        return existing["id"], False
    tags = read_tags(path)
    genres = split_genres(tags.get("genre") or genre_hint)
    track_id = db.add_track(
        source="local", path=str(path), title=tags["title"], artist=tags.get("artist", ""),
        album=tags.get("album", ""), isrc=tags.get("isrc"), duration=tags.get("duration", 0),
        genres=genres, family=genre_family(genres), collections=[collection] if collection else [],
    )
    return track_id, True


def scan_folder(folder: str) -> dict:
    """Alle Audiodateien eines Ordners (rekursiv) aufnehmen und zur Analyse einreihen."""
    from .demo import demo_genre

    root = Path(folder).expanduser()
    if not root.is_dir():
        raise FileNotFoundError(f"Ordner nicht gefunden: {folder}")
    added, ids = 0, []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in config.AUDIO_EXTENSIONS and not path.name.startswith("."):
            track_id, new = add_file(path, root.name, demo_genre(path))
            ids.append(track_id)
            added += new
    enqueue(ids)
    return {"found": len(ids), "added": added, "track_ids": ids}


def enqueue(track_ids: list[int]) -> None:
    global _worker
    todo = [i for i in track_ids if (t := db.get_track(i, light=True)) and t["source"] == "local" and t["status"] in ("pending", "error")]
    with _lock:
        if _queue.empty() and _state["done"] >= _state["total"]:
            _state.update(total=0, done=0)
        _state["total"] += len(todo)
        for i in todo:
            _queue.put(i)
        if todo and (_worker is None or not _worker.is_alive()):
            _worker = threading.Thread(target=_run, daemon=True, name="settracker-analysis")
            _worker.start()


def analyze_track(track_id: int) -> None:
    from .analysis import analyze_file

    track = db.get_track(track_id, light=True)
    if not track or not track["path"]:
        return
    db.update_track(track_id, status="analyzing")
    try:
        result = analyze_file(track["path"])
        db.update_track(track_id, status="done", error=None, analysis=result["analysis"], **result["fields"])
        db.save_waveform(track_id, result["waveform"])
    except Exception as exc:  # defekte/nicht lesbare Datei: Fehler am Track vermerken
        db.update_track(track_id, status="error", error=str(exc)[:300])


def _run() -> None:
    while True:
        try:
            track_id = _queue.get(timeout=1)
        except queue.Empty:
            return
        t = db.get_track(track_id, light=True)
        _state["current"] = t["title"] if t else ""
        analyze_track(track_id)
        _state["done"] += 1
        _state["current"] = ""


def status() -> dict:
    return {**_state, "running": _state["done"] < _state["total"]}


def wait_idle(timeout: float = 300) -> None:
    """Blockiert, bis alle Analysen fertig sind (für Tests und CLI)."""
    import time

    end = time.time() + timeout
    while status()["running"] and time.time() < end:
        time.sleep(0.1)
