"""Songstruktur auf Taktbasis: Intro, Hauptteil, Break, Outro."""
from __future__ import annotations

import numpy as np

from .features import Signal

LABELS = {"intro": "Intro", "main": "Hauptteil", "break": "Break", "outro": "Outro"}


def bars(sig: Signal, bpm: float, first_downbeat: float) -> dict:
    """Energie je Takt (gesamt und Bassanteil), normiert auf 0–1."""
    bar_len = 4 * 60.0 / bpm
    n = int((sig.duration - first_downbeat) / bar_len + 0.2)  # fast vollständiger Schlusstakt zählt mit
    energy, low = np.zeros(max(n, 1)), np.zeros(max(n, 1))
    for b in range(n):
        a, e = sig.frame(first_downbeat + b * bar_len), sig.frame(first_downbeat + (b + 1) * bar_len)
        if e > a:
            energy[b] = np.sqrt(np.mean(sig.full[a:e] ** 2))
            low[b] = np.sqrt(np.mean(sig.low[a:e] ** 2))
    norm = lambda x: np.clip(x / max(np.percentile(x, 95), 1e-9), 0, 1)  # noqa: E731
    return {"bar_len": bar_len, "n_bars": n, "energy": norm(energy), "low": norm(low)}


def _split_threshold(values: np.ndarray) -> float | None:
    """Schwelle zwischen 'leisen' und 'vollen' Takten (2-Means); None = keine klare Trennung."""
    lo, hi = float(values.min()), float(values.max())
    if hi - lo < 0.18:
        return None
    for _ in range(20):
        t = (lo + hi) / 2
        a, b = values[values <= t], values[values > t]
        if not len(a) or not len(b):
            break
        new_lo, new_hi = float(a.mean()), float(b.mean())
        if abs(new_lo - lo) + abs(new_hi - hi) < 1e-4:
            break
        lo, hi = new_lo, new_hi
    return (lo + hi) / 2 if hi - lo >= 0.15 else None


def _snap(bar: int, n: int, grid: int = 4) -> int:
    return int(np.clip(round(bar / grid) * grid, 0, n))


def sections(bar_energy: np.ndarray, bar_low: np.ndarray, bar_len: float, first_downbeat: float) -> list[dict]:
    """Abschnitte aus der Takt-Aktivität (Gesamtenergie und Bass/Kick zu gleichen Teilen)."""
    bar_energy = 0.5 * np.asarray(bar_energy) + 0.5 * np.asarray(bar_low)
    n = len(bar_energy)
    if n < 8:
        return [_section("main", 0, n, bar_len, first_downbeat)]
    smooth = np.convolve(bar_energy, np.ones(2) / 2, mode="same")
    threshold = _split_threshold(smooth)
    if threshold is None:
        return [_section("main", 0, n, bar_len, first_downbeat)]
    full = smooth > threshold

    # Läufe gleicher Aktivität; kurze Ausreißer (< 2 Takte) dem Vorgänger zuschlagen
    runs: list[list] = []
    for b, flag in enumerate(full):
        if runs and runs[-1][0] == bool(flag):
            runs[-1][2] = b + 1
        else:
            runs.append([bool(flag), b, b + 1])
    merged: list[list] = []
    for run in runs:
        if merged and (run[2] - run[1] < 2 or merged[-1][0] == run[0]):
            merged[-1][2] = run[2]
        else:
            merged.append(run)

    out: list[dict] = []
    for i, (flag, start, end) in enumerate(merged):
        start, end = _snap(start, n), (n if i == len(merged) - 1 else _snap(end, n))
        if end <= start:
            continue
        if flag:
            kind = "main"
        elif i == 0:
            kind = "intro"
        elif i == len(merged) - 1:
            kind = "outro"
        else:
            kind = "break"
        if out and out[-1]["kind"] == kind:
            out[-1].update(_section(kind, out[-1]["start_bar"], end, bar_len, first_downbeat))
        else:
            out.append(_section(kind, start, end, bar_len, first_downbeat))
    return out or [_section("main", 0, n, bar_len, first_downbeat)]


def _section(kind: str, start: int, end: int, bar_len: float, first_downbeat: float) -> dict:
    return {
        "kind": kind,
        "label": LABELS[kind],
        "start_bar": int(start),
        "end_bar": int(end),
        "start": round(first_downbeat + start * bar_len, 3),
        "end": round(first_downbeat + end * bar_len, 3),
    }
