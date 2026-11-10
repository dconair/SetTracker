"""Hot Cues, Loops und Phasen-Marken je Track (Pads 1–8 des DDJ-FLX4 = Hot Cue A–H).

Belegung:
  1 INTRO / START   Einstieg (erste Eins)
  2 DROP            Beginn des ersten Hauptteils
  3 BREAK           Beginn des ersten Breaks
  4 DROP 2          Hauptteil nach dem Break
  5 LOOP INTRO      4-Takt-Loop im Intro (nur Beat – zum Verlängern/Reinmixen)
  6 LOOP OUTRO      4-Takt-Loop im Outro (zum Verlängern beim Rausmixen)
  7 (frei für BASS SWAP aus dem Set-Übergang)
  8 OUTRO           Beginn des Outros = Mix-Out
"""
from __future__ import annotations

LETTERS = "ABCDEFGH"
LOOP_BARS = 4


def _fmt(seconds: float) -> str:
    seconds = max(0.0, seconds)
    return f"{int(seconds // 60)}:{seconds % 60:04.1f}"


def _cue(pad: int, name: str, time: float, bar: int, end: float | None = None, estimated: bool = False) -> dict:
    cue = {"pad": pad, "letter": LETTERS[pad - 1], "name": name, "kind": "loop" if end is not None else "cue",
           "time": round(float(time), 3), "label": _fmt(time), "bar": bar + 1, "estimated": estimated}
    if end is not None:
        cue["end"] = round(float(end), 3)
        cue["bars"] = LOOP_BARS
    return cue


def phases(track: dict) -> list[dict]:
    """Beschriftete Abschnitte (Intro, Drop, Break, …) mit Nummerierung bei Wiederholung."""
    an = track.get("analysis")
    if not an:
        return []
    out, counts = [], {"main": 0, "break": 0}
    for sec in an["sections"]:
        name = {"intro": "INTRO", "outro": "OUTRO", "main": "DROP", "break": "BREAK"}[sec["kind"]]
        if sec["kind"] in counts:
            counts[sec["kind"]] += 1
            if counts[sec["kind"]] > 1:
                name += f" {counts[sec['kind']]}"
        out.append({"name": name, "kind": sec["kind"], "time": sec["start"], "end": sec["end"], "label": _fmt(sec["start"]),
                    "bar": sec["start_bar"] + 1, "bars": sec["end_bar"] - sec["start_bar"]})
    return out


def track_cues(track: dict) -> list[dict]:
    """Cue-Plan eines Tracks. Mit Audio-Analyse taktgenau, sonst ein geschätztes Phrasenraster."""
    an = track.get("analysis")
    if not an:
        return _estimated(track)
    bar_len, first, n = an["bar_len"], an["first_downbeat"], an["n_bars"]
    at = lambda bar: first + bar * bar_len  # noqa: E731
    secs = an["sections"]
    mains = [s for s in secs if s["kind"] == "main"]
    breaks = [s for s in secs if s["kind"] == "break"]
    intro = secs[0] if secs[0]["kind"] == "intro" else None
    outro = secs[-1] if secs[-1]["kind"] == "outro" else None

    cues = [_cue(1, "INTRO" if intro else "START", at(0), 0)]
    if mains and mains[0]["start_bar"] > 0:
        cues.append(_cue(2, "DROP", mains[0]["start"], mains[0]["start_bar"]))
    if breaks:
        cues.append(_cue(3, "BREAK", breaks[0]["start"], breaks[0]["start_bar"]))
        after = next((m for m in mains if m["start_bar"] >= breaks[0]["end_bar"]), None)
        if after:
            cues.append(_cue(4, "DROP 2", after["start"], after["start_bar"]))
    if intro and intro["end_bar"] - intro["start_bar"] >= LOOP_BARS:
        cues.append(_cue(5, "LOOP INTRO", at(0), 0, end=at(LOOP_BARS)))
    if outro and outro["end_bar"] - outro["start_bar"] >= LOOP_BARS:
        cues.append(_cue(6, "LOOP OUTRO", outro["start"], outro["start_bar"], end=at(outro["start_bar"] + LOOP_BARS)))
        cues.append(_cue(8, "OUTRO", outro["start"], outro["start_bar"]))
    elif n > 2 * LOOP_BARS:
        # Kein Outro: die letzten vollen 4 Takte als Loop zum Verlängern
        bar = (n - LOOP_BARS) - (n - LOOP_BARS) % 4
        cues.append(_cue(6, "LOOP ENDE", at(bar), bar, end=at(bar + LOOP_BARS)))
    return sorted(cues, key=lambda c: c["pad"])


def _estimated(track: dict) -> list[dict]:
    """Ohne Audiodatei: Phrasenraster alle 16 Takte ab Trackbeginn – nur als Orientierung."""
    bpm, duration = track.get("bpm"), track.get("duration") or 0
    if not bpm or duration < 60:
        return []
    bar_len = 4 * 60.0 / bpm
    total = int(duration / bar_len)
    cues = [_cue(1, "START", 0.0, 0, estimated=True)]
    for pad, bar in ((2, 16), (3, 32), (4, 64)):
        if bar < total - 32:
            cues.append(_cue(pad, f"PHRASE (Takt {bar + 1})", bar * bar_len, bar, estimated=True))
    out_bar = max(0, (total - 32) - (total - 32) % 16)
    if out_bar > 16:
        cues.append(_cue(8, "MIX OUT?", out_bar * bar_len, out_bar, estimated=True))
    return cues


def set_cues(track: dict, plan_in: dict | None, plan_out: dict | None) -> list[dict]:
    """Cue-Plan im Set: Die Mix-Punkte der Übergänge ersetzen Pad 1/2 (rein) und 7/8 (raus)."""
    by_pad = {c["pad"]: c for c in track_cues(track)}
    for plan, key in ((plan_in, "cues_b"), (plan_out, "cues_a")):
        for c in (plan or {}).get(key, []):
            bar_len = (track.get("analysis") or {}).get("bar_len")
            first = (track.get("analysis") or {}).get("first_downbeat", 0)
            bar = int(round((c["time"] - first) / bar_len)) if bar_len else 0
            by_pad[c["pad"]] = _cue(c["pad"], c["name"], c["time"], bar)
    return [by_pad[p] for p in sorted(by_pad)]
