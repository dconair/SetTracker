"""Playlist-Check: bestehende Reihenfolge bewerten und Umbau vorschlagen."""
from __future__ import annotations

from .compat import pair_score, verdict
from .sequence import optimize, relative_energy
from .suggest import suggest


def rate(tracks: list[dict], weights: dict | None = None) -> dict:
    """Bewertet jeden Übergang der gegebenen Reihenfolge."""
    transitions = []
    for i in range(len(tracks) - 1):
        s = pair_score(tracks[i], tracks[i + 1], weights)
        transitions.append({"index": i, "from_id": tracks[i]["id"], "to_id": tracks[i + 1]["id"], **s})
    scores = [t["score"] for t in transitions]
    overall = sum(scores) / len(scores) if scores else 1.0
    return {
        "overall": round(overall, 3),
        "verdict": verdict(overall),
        "grade": grade(overall),
        "transitions": transitions,
        "counts": {v: sum(1 for t in transitions if t["verdict"] == v) for v in ("good", "ok", "bad")},
        "energy": relative_energy(tracks),
    }


def grade(score: float) -> str:
    for limit, label in ((0.85, "Sehr gut"), (0.72, "Gut"), (0.6, "Solide"), (0.5, "Holprig")):
        if score >= limit:
            return label
    return "Umbau empfohlen"


def fixes(tracks: list[dict], rating: dict, library: list[dict], weights: dict | None = None) -> list[dict]:
    """Kleine Eingriffe für jede Problemstelle: tauschen, Brücke einfügen, entfernen."""
    out = []
    in_set = {t["id"] for t in tracks}
    pool = [t for t in library if t["id"] not in in_set]
    total = sum(t["score"] for t in rating["transitions"])
    n = len(tracks)

    def total_of(order: list[dict]) -> float:
        return sum(pair_score(order[i], order[i + 1], weights)["score"] for i in range(len(order) - 1))

    for tr in rating["transitions"]:
        if tr["verdict"] != "bad":
            continue
        i = tr["index"]
        options = []
        # Tausch eines der beiden Tracks mit einem anderen Track der Playlist
        best = None
        for pos in (i, i + 1):
            for j in range(n):
                if j == pos:
                    continue
                trial = list(tracks)
                trial[pos], trial[j] = trial[j], trial[pos]
                gain = total_of(trial) - total
                if best is None or gain > best[0]:
                    best = (gain, pos, j)
        if best and best[0] > 0.05:
            _, pos, j = best
            options.append({
                "kind": "swap", "a": pos, "b": j, "gain": round(best[0] / max(n - 1, 1), 3),
                "text": f"„{tracks[pos]['title']}“ (Platz {pos + 1}) mit „{tracks[j]['title']}“ (Platz {j + 1}) tauschen",
            })
        # Brücken-Track aus der Bibliothek
        bridges = suggest(pool, tracks[i], tracks[i + 1], weights, limit=3)
        for br in bridges:
            if br["score"] > tr["score"] + 0.1:
                cand = next(t for t in pool if t["id"] == br["track_id"])
                options.append({
                    "kind": "bridge", "after": i, "track_id": cand["id"], "score": br["score"],
                    "text": f"„{cand['title']}“ von {cand['artist'] or 'unbekannt'} als Brücke einfügen",
                })
                break
        # Ausreißer entfernen: wenn die Nachbarn ohne ihn besser zusammenpassen
        for pos in (i, i + 1):
            if 0 < pos < n - 1:
                direct = pair_score(tracks[pos - 1], tracks[pos + 1], weights)["score"]
                around = (pair_score(tracks[pos - 1], tracks[pos], weights)["score"] + pair_score(tracks[pos], tracks[pos + 1], weights)["score"]) / 2
                if direct > around + 0.2:
                    options.append({"kind": "remove", "index": pos, "text": f"„{tracks[pos]['title']}“ (Platz {pos + 1}) passt nicht in die Umgebung – herausnehmen"})
                    break
        out.append({"index": i, "issues": tr["issues"], "options": options})
    return out


def review(tracks: list[dict], library: list[dict] | None = None, curve: str = "free",
           pinned: set[int] | None = None, weights: dict | None = None) -> dict:
    """Kompletter Check: Befund, Umbau-Vorschlag mit Vorher/Nachher, Einzel-Eingriffe."""
    before = rate(tracks, weights)
    opt = optimize(tracks, curve, pinned, weights)
    reordered = [tracks[i] for i in opt["order"]]
    after = rate(reordered, weights)
    moved = [tracks[i]["id"] for pos, i in enumerate(opt["order"]) if pos != i]
    worthwhile = after["overall"] - before["overall"] >= 0.03 and bool(moved)
    return {
        "before": before,
        "after": after,
        "order": [t["id"] for t in reordered],
        "moved": moved,
        "gain": round(after["overall"] - before["overall"], 3),
        "recommend_rebuild": worthwhile,
        "summary": _summary(before, after, worthwhile),
        "fixes": fixes(tracks, before, library or [], weights),
    }


def _summary(before: dict, after: dict, worthwhile: bool) -> str:
    c = before["counts"]
    n = sum(c.values())
    if n == 0:
        return "Zu wenige Tracks für eine Bewertung."
    text = f"{c['good']} von {n} Übergängen passen gut, {c['ok']} sind okay, {c['bad']} sind kritisch."
    if worthwhile:
        text += f" Ein Umbau hebt die Wertung von {before['overall'] * 100:.0f} auf {after['overall'] * 100:.0f} Punkte."
    elif c["bad"]:
        text += " Die Reihenfolge ist schon nah am Optimum – die kritischen Stellen lassen sich nur mit anderen Tracks lösen."
    else:
        text += " Die Reihenfolge passt so – kein Umbau nötig."
    return text
