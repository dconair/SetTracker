"""M3U-Playlist schreiben und lesen."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote, urlparse


def build(tracks: list[dict]) -> str:
    lines = ["#EXTM3U"]
    for t in tracks:
        label = f"{t['artist']} - {t['title']}" if t["artist"] else t["title"]
        if t.get("path"):
            lines += [f"#EXTINF:{int(t['duration'] or 0)},{label}", t["path"]]
        else:
            lines.append(f"# nur Spotify: {label} – https://open.spotify.com/track/{t.get('spotify_id')}")
    return "\n".join(lines) + "\n"


def parse(text: str, base: str | None = None) -> list[str]:
    paths = []
    for line in text.splitlines():
        line = line.strip().lstrip("\ufeff")
        if not line or line.startswith("#"):
            continue
        if line.startswith("file://"):
            line = unquote(urlparse(line).path)
        p = Path(line).expanduser()
        if not p.is_absolute() and base:
            p = Path(base) / p
        paths.append(str(p))
    return paths
