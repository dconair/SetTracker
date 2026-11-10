"""Wie gut passt Track B hinter Track A? Teil-Scores 0–1 plus Begründungen."""
from __future__ import annotations

from ..music import key_relation

DEFAULT_WEIGHTS = {"bpm": 0.30, "key": 0.25, "energy": 0.15, "genre": 0.15, "wave": 0.15}
PART_LABELS = {"bpm": "Tempo", "key": "Tonart", "energy": "Energie & Stimmung", "genre": "Genre", "wave": "Waveform"}

# Familien, die sich im Set gut mischen lassen
_RELATED = [
    {"House", "Techno", "Disco & Funk", "Afro & Amapiano", "EDM", "UK Garage", "Trance"},
    {"Drum & Bass", "Dubstep & Bass", "UK Garage"},
    {"Hip-Hop", "R&B & Soul", "Latin", "Reggae & Dancehall", "Pop"},
    {"Techno", "Trance", "Hardstyle & Hardcore"},
    {"Pop", "EDM", "Disco & Funk", "Rock"},
]


def tempo_match(bpm_a: float | None, bpm_b: float | None) -> dict | None:
    """Tempoabstand B gegenüber A in Prozent; Halb-/Doppeltempo wird berücksichtigt."""
    if not bpm_a or not bpm_b:
        return None
    factor = min((1.0, 0.5, 2.0), key=lambda m: abs(bpm_b * m / bpm_a - 1))
    pct = (bpm_b * factor / bpm_a - 1) * 100
    return {"factor": factor, "pct": pct, "diff": bpm_b * factor - bpm_a}


def _bpm(a: dict, b: dict) -> tuple[float | None, str]:
    tm = tempo_match(a.get("bpm"), b.get("bpm"))
    if tm is None:
        return None, "Tempo unbekannt"
    d = abs(tm["pct"])
    if d <= 2:
        score = 1.0
    elif d <= 6:
        score = 1.0 - (d - 2) / 4 * 0.4
    elif d <= 10:
        score = 0.6 - (d - 6) / 4 * 0.35
    elif d <= 16:
        score = 0.25 - (d - 10) / 6 * 0.2
    else:
        score = 0.0
    text = f"{tm['diff']:+.0f} BPM" if abs(tm["diff"]) >= 0.5 else "gleiches Tempo"
    if tm["factor"] != 1.0:
        score *= 0.85
        text += " (Halb-/Doppeltempo)"
    if d > 10:
        text += ", großer Temposprung"
    return score, text


def _energy(a: dict, b: dict) -> tuple[float | None, str]:
    ea, eb = a.get("energy"), b.get("energy")
    if ea is None or eb is None:
        return None, "Energie unbekannt"
    de = eb - ea
    score = 1 - min(1.0, abs(de) / 0.5)
    va, vb = a.get("valence"), b.get("valence")
    if va is not None and vb is not None:
        score = 0.7 * score + 0.3 * (1 - min(1.0, abs(vb - va) / 0.6))
    if abs(de) < 0.06:
        text = "Energie bleibt"
    elif de > 0:
        text = "Energie steigt stark" if de > 0.25 else "Energie ↑"
    else:
        text = "Energie fällt stark ab" if de < -0.25 else "Energie ↓"
    return score, text


def _genre(a: dict, b: dict) -> tuple[float | None, str]:
    fa, fb = a.get("family"), b.get("family")
    if not fa or not fb:
        return None, "Genre unbekannt"
    if fa == fb:
        ga, gb = set(map(str.lower, a.get("genres") or [])), set(map(str.lower, b.get("genres") or []))
        exact = bool(ga & gb) or not ga or not gb
        return (1.0 if exact else 0.85), f"beide {fa}"
    if any(fa in group and fb in group for group in _RELATED):
        return 0.55, f"{fa} → {fb}"
    return 0.15, f"Genrebruch {fa} → {fb}"


def section_bars(track: dict, kind: str) -> int:
    """Länge von Intro bzw. Outro in Takten (0, wenn nicht vorhanden oder nicht analysiert)."""
    secs = (track.get("analysis") or {}).get("sections") or []
    if not secs:
        return 0
    sec = secs[0] if kind == "intro" else secs[-1]
    return sec["end_bar"] - sec["start_bar"] if sec["kind"] == kind else 0


def _wave(a: dict, b: dict) -> tuple[float | None, str]:
    aa, ab = a.get("analysis"), b.get("analysis")
    if not aa or not ab:
        return None, "keine Waveform-Analyse"
    outro, intro = section_bars(a, "outro"), section_bars(b, "intro")
    overlap = min(outro, intro)
    length = 1.0 if overlap >= 16 else 0.8 if overlap >= 8 else 0.55 if overlap >= 4 else 0.25
    span = max(overlap, 4)
    low_a = aa["bar_low"][-span:] if outro else aa["bar_low"][-4:]
    low_b = ab["bar_low"][:span]
    clash = (sum(low_a) / max(len(low_a), 1)) * (sum(low_b) / max(len(low_b), 1))
    loud = 1.0
    if a.get("loudness") is not None and b.get("loudness") is not None:
        loud = 1 - min(1.0, abs(a["loudness"] - b["loudness"]) / 8)
    score = 0.45 * length + 0.35 * (1 - clash) + 0.2 * loud
    if overlap >= 8:
        text = f"{overlap} Takte Outro/Intro zum Mixen"
    elif overlap >= 4:
        text = f"nur {overlap} Takte Überlappung"
    elif not outro and not intro:
        text = "kein Outro und kein Intro – harter Übergang"
    elif not outro:
        text = "A endet ohne Outro"
    else:
        text = "B startet ohne Intro"
    if clash > 0.5:
        text += ", Bässe überlagern sich"
    return score, text


_PARTS = {"bpm": _bpm, "key": lambda a, b: key_relation(a.get("camelot"), b.get("camelot")), "energy": _energy, "genre": _genre, "wave": _wave}


def pair_score(a: dict, b: dict, weights: dict | None = None) -> dict:
    """Gesamt-Score A→B. Unbekannte Merkmale zählen neutral (werden ausgelassen)."""
    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    parts, total, wsum = {}, 0.0, 0.0
    for name, fn in _PARTS.items():
        score, text = fn(a, b)
        parts[name] = {"score": None if score is None else round(score, 3), "text": text, "label": PART_LABELS[name]}
        if score is not None and weights[name] > 0:
            total += weights[name] * score
            wsum += weights[name]
    score = total / wsum if wsum else 0.5
    known = [p for p in parts.values() if p["score"] is not None]
    worst = sorted(known, key=lambda p: p["score"])
    return {
        "score": round(score, 3),
        "verdict": verdict(score),
        "parts": parts,
        "reasons": [p["text"] for n, p in parts.items() if p["score"] is not None and n != "wave"][:3],
        "issues": [p["text"] for p in worst if p["score"] < 0.5],
        "confidence": round(wsum / sum(weights.values()), 2) if sum(weights.values()) else 0,
    }


def verdict(score: float) -> str:
    return "good" if score >= 0.72 else "ok" if score >= 0.5 else "bad"
