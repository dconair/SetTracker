"""Druckbarer Spickzettel: Set-Liste mit Übergängen und FLX4-Schritten (HTML)."""
from __future__ import annotations

from html import escape

from ..music import key_name

CSS = """
*{box-sizing:border-box}body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#14161a;margin:0;padding:32px;max-width:860px;margin-inline:auto}
h1{font-size:26px;margin:0 0 4px}.meta{color:#5b6472;margin-bottom:24px}
.track{display:flex;gap:14px;align-items:baseline;padding:10px 14px;border:1px solid #d9dde3;border-radius:10px;background:#f6f7f9;break-inside:avoid}
.num{font-weight:700;color:#5b6472;width:24px}.title{font-weight:650;flex:1}.artist{color:#5b6472;font-weight:400}
.tag{font:600 12px ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:6px;background:#e6e9ee;white-space:nowrap}
.trans{margin:6px 0 6px 38px;padding:10px 14px;border-left:3px solid #7c5cff;break-inside:avoid}
.trans h3{margin:0 0 2px;font-size:14px}.why{color:#5b6472;margin:0 0 6px}.trans ol{margin:0;padding-left:20px}.trans li{margin:2px 0}
.when{font-weight:650}.score{float:right}.good{color:#10804a}.ok{color:#a26400}.bad{color:#c22b2b}
@media print{body{padding:0}.track{background:#fff}}
"""


def build(name: str, tracks: list[dict], transitions: list[dict], scores: list[dict]) -> str:
    total = sum(t["duration"] or 0 for t in tracks)
    parts = [f"<!doctype html><html lang='de'><meta charset='utf-8'><title>{escape(name)} – Spickzettel</title><style>{CSS}</style>",
             f"<h1>{escape(name)}</h1><div class='meta'>{len(tracks)} Tracks · ca. {int(total // 60)} min · DDJ-FLX4 / rekordbox</div>"]
    for i, t in enumerate(tracks):
        tags = []
        if t.get("bpm"):
            tags.append(f"{t['bpm']:g} BPM")
        if t.get("camelot"):
            tags.append(f"{t['camelot']} · {key_name(t['camelot'])}")
        if not t.get("path"):
            tags.append("Spotify")
        parts.append(
            f"<div class='track'><span class='num'>{i + 1}</span><span class='title'>{escape(t['title'])} "
            f"<span class='artist'>– {escape(t['artist'] or '')}</span></span>"
            + "".join(f"<span class='tag'>{escape(x)}</span>" for x in tags) + "</div>"
        )
        if i < len(transitions):
            tr, sc = transitions[i], scores[i]
            head = f"Deck {tr['deck_a']} → Deck {tr['deck_b']}: {escape(tr['title'])}"
            if tr.get("mix_out"):
                head += f" · raus bei {tr['mix_out']['label']}, rein bei {tr['mix_in']['label']}"
            steps = "".join(f"<li><span class='when'>{escape(s['when'])}:</span> {escape(s['text'])}</li>" for s in tr["steps"])
            parts.append(
                f"<div class='trans'><h3>{head}<span class='score {sc['verdict']}'>{round(sc['score'] * 100)} Punkte</span></h3>"
                f"<p class='why'>{escape(tr['why'])}</p><ol>{steps}</ol></div>"
            )
    return "".join(parts) + "</html>"
