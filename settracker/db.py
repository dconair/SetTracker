"""SQLite-Speicher: Tracks, Waveforms, Sets, Cache."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Iterable

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,              -- 'local' | 'spotify'
    path TEXT UNIQUE,
    spotify_id TEXT,
    isrc TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    album TEXT NOT NULL DEFAULT '',
    genres TEXT NOT NULL DEFAULT '[]', -- rohe Genre-Tags (JSON-Liste)
    family TEXT NOT NULL DEFAULT '',   -- Genre-Familie, z. B. 'House'
    duration REAL NOT NULL DEFAULT 0,
    bpm REAL,
    camelot TEXT,
    energy REAL,
    valence REAL,
    danceability REAL,
    loudness REAL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | analyzing | done | error | partial
    error TEXT,
    analysis TEXT,                     -- JSON: Beatgrid, Abschnitte, Takt-Energie
    collections TEXT NOT NULL DEFAULT '[]', -- Herkunft: Ordner / Playlist-Namen
    data_source TEXT NOT NULL DEFAULT '', -- woher BPM/Tonart/Stimmung stammen
    added REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_spotify ON tracks(spotify_id);
CREATE TABLE IF NOT EXISTS waveforms (track_id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    curve TEXT NOT NULL DEFAULT 'build',
    items TEXT NOT NULL DEFAULT '[]',     -- [{track_id, pinned}]
    overrides TEXT NOT NULL DEFAULT '{}', -- {"a-b": template}
    origin TEXT NOT NULL DEFAULT '',
    created REAL NOT NULL,
    updated REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

JSON_FIELDS = ("genres", "analysis", "collections")
_local = threading.local()
_db_path: Path | None = None


def set_path(path: Path | str | None) -> None:
    """Datenbankpfad setzen (Tests nutzen eine temporäre Datei)."""
    global _db_path
    _db_path = Path(path) if path else None
    _local.__dict__.clear()


def conn() -> sqlite3.Connection:
    path = _db_path or (config.data_dir() / "settracker.db")
    cached = getattr(_local, "conn", None)
    if cached is not None and getattr(_local, "path", None) == path:
        return cached
    c = sqlite3.connect(path, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.executescript(SCHEMA)
    if "data_source" not in {r["name"] for r in c.execute("PRAGMA table_info(tracks)")}:
        c.execute("ALTER TABLE tracks ADD COLUMN data_source TEXT NOT NULL DEFAULT ''")
    if "spotify_playlist_id" not in {r["name"] for r in c.execute("PRAGMA table_info(sets)")}:
        c.execute("ALTER TABLE sets ADD COLUMN spotify_playlist_id TEXT")  # Datenbanken älterer Versionen
    _local.conn, _local.path = c, path
    return c


def _row(row: sqlite3.Row | None, light: bool = False) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for f in JSON_FIELDS:
        if f in d:
            d[f] = json.loads(d[f]) if d[f] else None
    if light:
        d["has_analysis"] = bool(d.pop("analysis", None))
    return d


# ---------------------------------------------------------------- Tracks
def add_track(**fields: Any) -> int:
    fields.setdefault("added", time.time())
    for f in JSON_FIELDS:
        if f in fields and not isinstance(fields[f], str):
            fields[f] = json.dumps(fields[f])
    cols = ", ".join(fields)
    marks = ", ".join("?" for _ in fields)
    c = conn()
    cur = c.execute(f"INSERT INTO tracks ({cols}) VALUES ({marks})", list(fields.values()))
    c.commit()
    return int(cur.lastrowid)


def update_track(track_id: int, **fields: Any) -> None:
    if not fields:
        return
    for f in JSON_FIELDS:
        if f in fields and fields[f] is not None and not isinstance(fields[f], str):
            fields[f] = json.dumps(fields[f])
    sets = ", ".join(f"{k} = ?" for k in fields)
    c = conn()
    c.execute(f"UPDATE tracks SET {sets} WHERE id = ?", [*fields.values(), track_id])
    c.commit()


def get_track(track_id: int, light: bool = False) -> dict | None:
    return _row(conn().execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone(), light)


def get_tracks(ids: Iterable[int]) -> list[dict]:
    """Tracks in der Reihenfolge der IDs (fehlende werden übersprungen)."""
    ids = list(ids)
    if not ids:
        return []
    marks = ",".join("?" for _ in ids)
    rows = conn().execute(f"SELECT * FROM tracks WHERE id IN ({marks})", ids).fetchall()
    by_id = {r["id"]: _row(r) for r in rows}
    return [by_id[i] for i in ids if i in by_id]


def all_tracks(light: bool = True) -> list[dict]:
    rows = conn().execute("SELECT * FROM tracks ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE").fetchall()
    return [_row(r, light) for r in rows]


def find_track(**where: Any) -> dict | None:
    cond = " AND ".join(f"{k} = ?" for k in where)
    return _row(conn().execute(f"SELECT * FROM tracks WHERE {cond} LIMIT 1", list(where.values())).fetchone())


def delete_track(track_id: int) -> None:
    c = conn()
    c.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    c.execute("DELETE FROM waveforms WHERE track_id = ?", (track_id,))
    c.commit()


def add_collection(track_id: int, name: str) -> None:
    t = get_track(track_id)
    if t and name and name not in (t["collections"] or []):
        update_track(track_id, collections=[*(t["collections"] or []), name])


def save_waveform(track_id: int, data: dict) -> None:
    c = conn()
    c.execute("INSERT OR REPLACE INTO waveforms (track_id, data) VALUES (?, ?)", (track_id, json.dumps(data)))
    c.commit()


def get_waveform(track_id: int) -> dict | None:
    row = conn().execute("SELECT data FROM waveforms WHERE track_id = ?", (track_id,)).fetchone()
    return json.loads(row["data"]) if row else None


# ---------------------------------------------------------------- Sets
def _set(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    d["items"] = json.loads(d["items"])
    d["overrides"] = json.loads(d["overrides"])
    return d


def create_set(name: str, items: list[dict] | None = None, curve: str = "build", origin: str = "",
               spotify_playlist_id: str | None = None) -> dict:
    now = time.time()
    c = conn()
    cur = c.execute(
        "INSERT INTO sets (name, curve, items, origin, spotify_playlist_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (name, curve, json.dumps(items or []), origin, spotify_playlist_id, now, now),
    )
    c.commit()
    return get_set(int(cur.lastrowid))  # type: ignore[return-value]


def get_set(set_id: int) -> dict | None:
    return _set(conn().execute("SELECT * FROM sets WHERE id = ?", (set_id,)).fetchone())


def list_sets() -> list[dict]:
    return [_set(r) for r in conn().execute("SELECT * FROM sets ORDER BY updated DESC").fetchall()]


def update_set(set_id: int, **fields: Any) -> dict | None:
    for f in ("items", "overrides"):
        if f in fields:
            fields[f] = json.dumps(fields[f])
    fields["updated"] = time.time()
    sets = ", ".join(f"{k} = ?" for k in fields)
    c = conn()
    c.execute(f"UPDATE sets SET {sets} WHERE id = ?", [*fields.values(), set_id])
    c.commit()
    return get_set(set_id)


def delete_set(set_id: int) -> None:
    c = conn()
    c.execute("DELETE FROM sets WHERE id = ?", (set_id,))
    c.commit()


# ---------------------------------------------------------------- Key/Value
def kv_get(key: str, default: Any = None) -> Any:
    row = conn().execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def kv_set(key: str, value: Any) -> None:
    c = conn()
    c.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (key, json.dumps(value)))
    c.commit()
