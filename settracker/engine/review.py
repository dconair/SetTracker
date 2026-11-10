"""Playlist-Check: bestehende Reihenfolge bewerten und Umbau vorschlagen."""
from __future__ import annotations

from statistics import median

from ..music import mood_label
from .compat import pair_score, tempo_match, verdict
from .sequence import mood_fit, optimize, relative_energy

FOCUS = {"transitions": 0.0, "balanced": 0.2, "mood": 0.5}
FOCUS_LABELS = {"transitions": "Flüssige Übergänge", "balanced": "Ausgewogen", "mood": "Stimmungsverlauf"}
from .suggest import suggest


def rate(tracks: list[dict], weights: dict | None = None) -> dict:
    """Bewertet jeden Übergang der gegebenen Reihenfolge."""
    transitions = []
    for i in range(len(tracks) - 1):
        s = pair_score(tracks[i], tracks[i + 1], weights)
        transitions.append({"index": i, "from_id": tracks[i]["id"], "to_id": tracks[i + 1]["id"], **s})
    scores = [t["score"] for t in transitions]
    overall = sum(scores) / len(scores) if scores else 1.0
    moods = [m for i in range(len(tracks) - 1) if (m := mood_fit(tracks[i], tracks[i + 1])) is not None]
    return {
        "mood_score": round(sum(moods) / len(moods), 3) if moods else None,
        "moods": [mood_label(t.get("energy"), t.get("valence")) for t in tracks],
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


def findings(tracks: list[dict], rating: dict) -> list[dict]:
    """Auffälligkeiten der Playlist in Klartext: Tempo, Tonart, Stimmung, Energie, Genre, fehlende Daten."""
    out: list[dict] = []
    n = len(tracks)

    def add(kind: str, severity: str, index: int, title: str, text: str, ids: list[int]) -> None:
        out.append({"kind": kind, "severity": severity, "index": index, "title": title, "text": text, "track_ids": ids})

    name = lambda i: f"„{tracks[i]['title']}“ (Platz {i + 1})"  # noqa: E731
    outliers: set[int] = set()
    for i, t in enumerate(tracks):
        if not t.get("bpm"):
            add("no_data", "info", i, "Keine Daten", f"Für {name(i)} liegen weder BPM noch Tonart vor – der Track wird in der Wertung ausgelassen.", [t["id"]])
            continue
        # Median über ein Fenster von ±3 mit mindestens drei Nachbarn – so verfälscht ein
        # einzelner Ausreißer nicht den Vergleichswert der Tracks neben ihm.
        around = [tracks[j]["bpm"] for j in range(max(0, i - 3), min(n, i + 4)) if j != i and tracks[j].get("bpm")]
        if len(around) >= 3:
            tm = tempo_match(median(around), t["bpm"])
            if tm and abs(tm["pct"]) > 8:
                outliers.add(i)
                add("tempo_outlier", "high", i, "Tempo-Ausreißer",
                    f"{name(i)} läuft mit {t['bpm']:g} BPM, die Tracks drumherum mit rund {median(around):g} BPM ({tm['pct']:+.0f} %).", [t["id"]])
    energy = rating["energy"]
    for tr in rating["transitions"]:
        i = tr["index"]
        a, b = tracks[i], tracks[i + 1]
        ids = [a["id"], b["id"]]
        tm = tempo_match(a.get("bpm"), b.get("bpm"))
        if tm and abs(tm["pct"]) > 6 and not {i, i + 1} & outliers:
            add("tempo_jump", "medium", i, "Temposprung",
                f"Von {name(i)} zu {name(i + 1)} sind es {tm['diff']:+.0f} BPM ({abs(tm['pct']):.0f} %) – mehr als der Standard-Pitchbereich von ±6 %.", ids)
        key = tr["parts"]["key"]["score"]
        if key is not None and key < 0.3:
            add("key_clash", "medium", i, "Tonart-Clash",
                f"{name(i)} ({a['camelot']}) und {name(i + 1)} ({b['camelot']}) liegen harmonisch weit auseinander – nur kurz überblenden.", ids)
        va, vb = a.get("valence"), b.get("valence")
        if va is not None and vb is not None:
            ma, mb = mood_label(a.get("energy"), va), mood_label(b.get("energy"), vb)
            if abs(vb - va) > 0.35 or {ma, mb} in ({"Euphorisch", "Melancholisch"}, {"Treibend & dunkel", "Entspannt"}):
                add("mood_break", "medium", i, "Stimmungsbruch", f"{name(i)} wirkt „{ma}“, {name(i + 1)} „{mb}“ – der Wechsel kommt abrupt.", ids)
    for i in range(1, n - 1):
        lo, hi = min(energy[i - 1], energy[i + 1]), max(energy[i - 1], energy[i + 1])
        if tracks[i].get("energy") is None:
            continue
        if energy[i] < lo - 0.4:
            add("energy_dip", "medium", i, "Energie-Loch", f"{name(i)} ist deutlich ruhiger als die Tracks davor und danach.", [tracks[i]["id"]])
        elif energy[i] > hi + 0.4:
            add("energy_spike", "info", i, "Energie-Spitze", f"{name(i)} ist deutlich energiereicher als die Tracks davor und danach.", [tracks[i]["id"]])
        fa, fb, fc = tracks[i - 1].get("family"), tracks[i].get("family"), tracks[i + 1].get("family")
        if fa and fb and fa == fc and fb != fa:
            add("genre_outlier", "medium", i, "Genre-Ausreißer", f"{name(i)} ist {fb}, davor und danach läuft {fa}.", [tracks[i]["id"]])
    order = {"high": 0, "medium": 1, "info": 2}
    return sorted(out, key=lambda f: (order[f["severity"]], f["index"]))


def review(tracks: list[dict], library: list[dict] | None = None, curve: str = "free",
           pinned: set[int] | None = None, weights: dict | None = None, focus: str = "balanced") -> dict:
    """Kompletter Check: Befund, Auffälligkeiten, Umbau-Vorschlag mit Vorher/Nachher, Einzel-Eingriffe."""
    before = rate(tracks, weights)
    opt = optimize(tracks, curve, pinned, weights, mood_weight=FOCUS.get(focus, 0.2))
    reordered = [tracks[i] for i in opt["order"]]
    after = rate(reordered, weights)
    moved = [tracks[i]["id"] for pos, i in enumerate(opt["order"]) if pos != i]
    mood_gain = (after["mood_score"] or 0) - (before["mood_score"] or 0)
    worthwhile = bool(moved) and (after["overall"] - before["overall"] >= 0.03 or (mood_gain >= 0.05 and after["overall"] >= before["overall"] - 0.01))
    return {
        "findings": findings(tracks, before),
        "mood_gain": round(mood_gain, 3),
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
