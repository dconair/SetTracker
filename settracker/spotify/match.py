"""Erkennen, ob eine lokale Datei und ein Spotify-Eintrag derselbe Track sind."""
from __future__ import annotations

import re


def norm(text: str | None) -> str:
    """Vergleichsform: ohne Klammerzusätze („Original Mix“), Features, Satz- und Leerzeichen."""
    text = re.sub(r"\(.*?\)|\[.*?\]|\bfeat\..*|\bft\..*", "", (text or "").lower())
    return re.sub(r"[^a-z0-9]+", "", text)


def first_artist(artist: str | None) -> str:
    return norm(re.split(r",|&| x | feat| ft\.", (artist or "").lower())[0])


def same_track(a: dict, b: dict) -> bool:
    """Gleiche ISRC – oder gleicher Titel, passender erster Künstler und ähnliche Dauer."""
    ia, ib = (a.get("isrc") or "").upper(), (b.get("isrc") or "").upper()
    if ia and ib:
        return ia == ib
    title = norm(a.get("title"))
    if not title or title != norm(b.get("title")):
        return False
    aa, ab = first_artist(a.get("artist")), first_artist(b.get("artist"))
    if aa and ab and aa not in norm(b.get("artist")) and ab not in norm(a.get("artist")):
        return False
    da, db_ = a.get("duration") or 0, b.get("duration") or 0
    return not da or not db_ or abs(da - db_) < 15


def similarity(a: dict, b: dict) -> float:
    """Grobe Ähnlichkeit 0–1 zum Vorsortieren bei der Zuordnung von Hand."""
    def tokens(t: dict) -> set[str]:
        return set(re.findall(r"[a-z0-9]{2,}", f"{t.get('title', '')} {t.get('artist', '')}".lower()))

    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    score = len(ta & tb) / len(ta | tb)
    da, db_ = a.get("duration") or 0, b.get("duration") or 0
    if da and db_ and abs(da - db_) < 5:
        score += 0.2
    return min(score, 1.0)
