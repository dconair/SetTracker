"""ReccoBeats: BPM, Tonart, Energie und Stimmung für Spotify-Tracks (Ersatz für Spotifys
abgeschaltete Audio-Features) sowie ähnliche Tracks für Smart Shuffle."""
from __future__ import annotations

import re

import httpx

from ..music import to_camelot

BASE = "https://api.reccobeats.com/v1"
BATCH = 40


def _spotify_id(href: str | None) -> str | None:
    m = re.search(r"/track/([A-Za-z0-9]+)", href or "")
    return m.group(1) if m else None


def to_fields(item: dict) -> dict:
    fields = {}
    if item.get("tempo"):
        fields["bpm"] = round(float(item["tempo"]), 1)
    key, mode = item.get("key"), item.get("mode")
    if key is not None and key >= 0 and mode is not None:
        fields["camelot"] = to_camelot(int(key), bool(mode))
    for name in ("energy", "valence", "danceability", "loudness"):
        if item.get(name) is not None:
            fields[name] = round(float(item[name]), 3)
    return fields


def features(spotify_ids: list[str]) -> dict[str, dict]:
    """Track-Felder je Spotify-ID. Unbekannte Tracks fehlen im Ergebnis."""
    out: dict[str, dict] = {}
    ids = list(dict.fromkeys(spotify_ids))
    for start in range(0, len(ids), BATCH):
        try:
            r = httpx.get(f"{BASE}/audio-features", params={"ids": ",".join(ids[start : start + BATCH])}, timeout=30)
            r.raise_for_status()
        except httpx.HTTPError:
            continue
        for item in r.json().get("content") or []:
            sid = _spotify_id(item.get("href"))
            if sid:
                out[sid] = to_fields(item)
    return out


def recommendations(seed_ids: list[str], size: int = 20) -> list[dict]:
    """Ähnliche Tracks zu bis zu 5 Seeds (Spotify-IDs)."""
    if not seed_ids:
        return []
    try:
        r = httpx.get(f"{BASE}/track/recommendation", params={"seeds": ",".join(seed_ids[:5]), "size": size}, timeout=30)
        r.raise_for_status()
    except httpx.HTTPError:
        return []
    out = []
    for item in r.json().get("content") or []:
        sid = _spotify_id(item.get("href"))
        if sid:
            out.append({
                "spotify_id": sid, "title": item.get("trackTitle") or "",
                "artist": ", ".join(a["name"] for a in item.get("artists") or [] if a.get("name")),
                "duration": (item.get("durationMs") or 0) / 1000, "isrc": item.get("isrc"),
            })
    return out
