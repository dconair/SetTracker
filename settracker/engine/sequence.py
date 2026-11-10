"""Reihenfolge optimieren: gute Übergänge entlang einer gewünschten Energiekurve."""
from __future__ import annotations

import math

from .compat import pair_score

CURVES = {
    "build": "Aufbauend",
    "peak": "Peak in der Mitte",
    "wave": "Welle",
    "free": "Egal – nur Übergänge",
}


def curve_target(frac: float, curve: str) -> float | None:
    """Ziel-Energie (0–1, relativ zum Set) an Position frac ∈ [0, 1]."""
    if curve == "build":
        return 0.1 + 0.9 * frac
    if curve == "peak":
        return 0.1 + 0.9 * math.sin(math.pi * min(frac / 0.65, 1.0) / 2) if frac <= 0.65 else 1.0 - 0.6 * (frac - 0.65) / 0.35
    if curve == "wave":
        return 0.5 - 0.4 * math.cos(2 * math.pi * 1.5 * frac)
    return None


def relative_energy(tracks: list[dict]) -> list[float]:
    """Energie je Track als Rang innerhalb des Sets (0 = ruhigster, 1 = stärkster)."""
    known = sorted({t["energy"] for t in tracks if t.get("energy") is not None})
    if len(known) < 2:
        return [0.5] * len(tracks)
    rank = {e: i / (len(known) - 1) for i, e in enumerate(known)}
    return [rank.get(t.get("energy"), 0.5) for t in tracks]


def optimize(tracks: list[dict], curve: str = "build", pinned: set[int] | None = None,
             weights: dict | None = None, curve_weight: float = 0.3) -> dict:
    """Beste gefundene Reihenfolge. `pinned` = Positionen (Indizes), die fix bleiben.

    Liefert {"order": Indizes in neuer Reihenfolge, "before": Score, "after": Score}.
    """
    n = len(tracks)
    pinned = {p for p in (pinned or set()) if 0 <= p < n}
    if n < 3:
        return {"order": list(range(n)), "before": 1.0, "after": 1.0}
    matrix = [[pair_score(a, b, weights)["score"] if i != j else 0.0 for j, b in enumerate(tracks)] for i, a in enumerate(tracks)]
    rel = relative_energy(tracks)
    targets = [curve_target(i / (n - 1), curve) for i in range(n)]
    cw = 0.0 if curve == "free" or targets[0] is None else curve_weight

    def objective(order: list[int]) -> float:
        pairs = sum(matrix[order[i]][order[i + 1]] for i in range(n - 1)) / (n - 1)
        if not cw:
            return pairs
        fit = 1 - sum(abs(rel[t] - targets[i]) for i, t in enumerate(order)) / n
        return (1 - cw) * pairs + cw * fit

    # Start: gierig von links nach rechts, fixe Positionen bleiben besetzt
    order: list[int | None] = [i if i in pinned else None for i in range(n)]
    free = [i for i in range(n) if i not in pinned]
    remaining = set(free)
    for pos in range(n):
        if order[pos] is not None:
            continue
        prev = order[pos - 1] if pos else None
        nxt = order[pos + 1] if pos + 1 < n else None

        def gain(c: int) -> float:
            g = matrix[prev][c] if prev is not None else 0.5
            if nxt is not None:
                g = (g + matrix[c][nxt]) / 2
            return (1 - cw) * g + cw * (1 - abs(rel[c] - targets[pos])) if cw else g

        pick = max(sorted(remaining), key=gain)
        order[pos] = pick
        remaining.discard(pick)
    best: list[int] = order  # type: ignore[assignment]
    start = list(range(n))
    candidates = [best, start]
    result = None
    for cand in candidates:
        cur, cur_score = list(cand), objective(cand)
        improved = True
        while improved:
            improved = False
            for i in free:
                for j in free:
                    if j <= i:
                        continue
                    trial = list(cur)
                    trial[i], trial[j] = trial[j], trial[i]
                    s = objective(trial)
                    if s > cur_score + 1e-9:
                        cur, cur_score, improved = trial, s, True
                    # Abschnitt umdrehen, wenn keine fixe Position darin liegt
                    if j - i > 1 and not any(p in pinned for p in range(i, j + 1)):
                        trial = cur[:i] + cur[i : j + 1][::-1] + cur[j + 1 :]
                        s = objective(trial)
                        if s > cur_score + 1e-9:
                            cur, cur_score, improved = trial, s, True
        if result is None or cur_score > result[1]:
            result = (cur, cur_score)
    assert result is not None
    return {"order": result[0], "before": round(objective(start), 3), "after": round(result[1], 3)}
