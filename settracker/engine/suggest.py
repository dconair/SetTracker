"""Smart Shuffle: passende Tracks für die nächste Position oder eine Lücke."""
from __future__ import annotations

from .compat import pair_score


def suggest(candidates: list[dict], after: dict | None, before: dict | None = None,
            weights: dict | None = None, limit: int = 12) -> list[dict]:
    """Bewertet Kandidaten für die Position zwischen `after` und `before`."""
    out = []
    for c in candidates:
        if after is None and before is None:
            break
        scores, reasons = [], []
        if after is not None:
            s = pair_score(after, c, weights)
            scores.append(s["score"])
            reasons = s["reasons"]
        if before is not None:
            s2 = pair_score(c, before, weights)
            scores.append(s2["score"])
            reasons = reasons or s2["reasons"]
        # Die schwächere Seite zählt stärker: eine Brücke muss in beide Richtungen tragen.
        score = 0.6 * min(scores) + 0.4 * sum(scores) / len(scores)
        out.append({"track_id": c["id"], "score": round(score, 3), "reasons": reasons})
    out.sort(key=lambda x: -x["score"])
    return out[:limit]
