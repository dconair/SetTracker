"""Export/Import im rekordbox-XML-Format (DJ_PLAYLISTS) inkl. Beatgrid und Hot Cues."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

CUE_COLORS = {"MIX IN": (40, 226, 20), "INTRO": (40, 226, 20), "START": (40, 226, 20), "DROP": (255, 140, 0),
              "BREAK": (170, 110, 255), "LOOP": (255, 220, 0), "BASS SWAP": (0, 176, 255), "MIX OUT": (230, 40, 40), "OUTRO": (230, 40, 40)}


def _color(name: str) -> tuple[int, int, int]:
    return next((c for key, c in CUE_COLORS.items() if name.startswith(key)), (200, 200, 200))
KINDS = {".mp3": "MP3 File", ".wav": "WAV File", ".flac": "FLAC File", ".m4a": "M4A File", ".aiff": "AIFF File", ".aif": "AIFF File"}


def location(path: str) -> str:
    posix = Path(path).as_posix()
    return "file://localhost/" + quote(posix.lstrip("/"), safe="/:")


def build(name: str, tracks: list[dict], cues: dict[int, list[dict]], phases: dict[int, list[dict]] | None = None) -> str:
    """XML für die lokalen Tracks eines Sets.

    `cues`: Track-ID → Hot Cues [{pad, name, time, end?}] (mit `end` als Loop).
    `phases`: Track-ID → Abschnitte [{name, time}], landen als beschriftete Memory Cues im Track.
    """
    local = [t for t in tracks if t.get("path")]
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="rekordbox", Version="6.0.0", Company="AlphaTheta")
    coll = ET.SubElement(root, "COLLECTION", Entries=str(len({t["id"] for t in local})))
    seen = set()
    for t in local:
        if t["id"] in seen:
            continue
        seen.add(t["id"])
        el = ET.SubElement(
            coll, "TRACK", TrackID=str(t["id"]), Name=t["title"], Artist=t["artist"] or "", Album=t["album"] or "",
            Genre=", ".join(t.get("genres") or []), Kind=KINDS.get(Path(t["path"]).suffix.lower(), "Audio File"),
            TotalTime=str(int(round(t["duration"] or 0))), AverageBpm=f"{t['bpm']:.2f}" if t.get("bpm") else "0.00",
            Tonality=t.get("camelot") or "", Location=location(t["path"]),
        )
        an = t.get("analysis")
        if an and t.get("bpm"):
            ET.SubElement(el, "TEMPO", Inizio=f"{an['first_downbeat']:.3f}", Bpm=f"{t['bpm']:.2f}", Metro="4/4", Battito="1")
        for ph in (phases or {}).get(t["id"], []):
            r, g, b = _color(ph["name"])
            ET.SubElement(el, "POSITION_MARK", Name=ph["name"], Type="0", Start=f"{ph['time']:.3f}", Num="-1",
                          Red=str(r), Green=str(g), Blue=str(b))
        for cue in sorted(cues.get(t["id"], []), key=lambda c: c["pad"]):
            r, g, b = _color(cue["name"])
            attrs = {"Name": cue["name"], "Type": "4" if cue.get("end") else "0", "Start": f"{cue['time']:.3f}"}
            if cue.get("end"):
                attrs["End"] = f"{cue['end']:.3f}"
            ET.SubElement(el, "POSITION_MARK", **attrs, Num=str(cue["pad"] - 1), Red=str(r), Green=str(g), Blue=str(b))
    playlists = ET.SubElement(root, "PLAYLISTS")
    node = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count="1")
    pl = ET.SubElement(node, "NODE", Name=name, Type="1", KeyType="0", Entries=str(len(local)))
    for t in local:
        ET.SubElement(pl, "TRACK", Key=str(t["id"]))
    ET.indent(root)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def parse(text: str) -> list[dict]:
    """Playlists aus einer rekordbox-XML: [{name, paths}] in Playlist-Reihenfolge."""
    root = ET.fromstring(text)
    by_id = {}
    for tr in root.iterfind("./COLLECTION/TRACK"):
        loc = tr.get("Location") or ""
        path = unquote(urlparse(loc).path)
        if len(path) > 2 and path[0] == "/" and path[2] == ":":  # Windows: /C:/Musik/...
            path = path[1:]
        by_id[tr.get("TrackID")] = path
    out = []
    for node in root.iter("NODE"):
        if node.get("Type") == "1":
            paths = [by_id[k.get("Key")] for k in node.iterfind("TRACK") if k.get("Key") in by_id]
            if paths:
                out.append({"name": node.get("Name") or "Playlist", "paths": paths})
    if not out and by_id:
        out.append({"name": "rekordbox-Sammlung", "paths": list(by_id.values())})
    return out
