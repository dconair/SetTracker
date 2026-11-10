"""Audio-Analyse lokaler Dateien."""
from __future__ import annotations

from . import features, structure, waveform


def analyze_file(path: str) -> dict:
    """Vollanalyse einer Audiodatei. Liefert Track-Felder, Analyse-Details und Waveform."""
    sig = features.load(path)
    grid = features.beatgrid(sig)
    camelot = features.detect_key(sig)
    mood = features.mood(sig, grid["bpm"], camelot)
    bars = structure.bars(sig, grid["bpm"], grid["first_downbeat"])
    secs = structure.sections(bars["energy"], bars["low"], bars["bar_len"], grid["first_downbeat"])
    return {
        "fields": {"duration": round(sig.duration, 2), "bpm": grid["bpm"], "camelot": camelot, **mood},
        "analysis": {
            **grid,
            "bar_len": round(bars["bar_len"], 4),
            "n_bars": bars["n_bars"],
            "bar_energy": [round(float(v), 3) for v in bars["energy"]],
            "bar_low": [round(float(v), 3) for v in bars["low"]],
            "sections": secs,
        },
        "waveform": waveform.peaks(sig),
    }
