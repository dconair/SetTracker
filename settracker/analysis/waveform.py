"""Kompakte Waveform-Daten (3 Frequenzbänder) für die Anzeige."""
from __future__ import annotations

import numpy as np

from .features import Signal

POINTS = 1200


def peaks(sig: Signal, points: int = POINTS) -> dict:
    edges = np.linspace(0, len(sig.full), points + 1).astype(int)
    scale = max(float(np.percentile(sig.full, 99.5)), 1e-9)

    def reduce(env: np.ndarray) -> list[int]:
        vals = [env[a : max(b, a + 1)].max() for a, b in zip(edges[:-1], edges[1:])]
        return [int(v) for v in np.clip(np.array(vals) / scale * 255, 0, 255)]

    return {"duration": round(sig.duration, 3), "low": reduce(sig.low), "mid": reduce(sig.mid), "high": reduce(sig.high)}
