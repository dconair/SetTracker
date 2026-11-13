"""Regler-Automation eines Übergangs: Was steht wann wo?

Eine Automation beschreibt jeden beteiligten Regler als Kurve über die Takte des Übergangs.
Aus ihr entstehen die Schritt-Texte, das Diagramm, die Controller-Animation und die Hörvorschau –
alle zeigen deshalb garantiert dasselbe.

Werte 0…1: Fader 0 = zu, 1 = offen. EQ und Filter (CFX) 0,5 = Mittelstellung (12 Uhr);
EQ 0 = ganz zurückgedreht, CFX < 0,5 = Low-Pass (dumpf), > 0,5 = High-Pass (dünn).
Punkte sind [Takt, Wert] ab Beginn des Übergangs; zwei Punkte im selben Takt bedeuten einen Sprung.
"""
from __future__ import annotations

Points = list[list[float]]
NEUTRAL = {"fader_a": 1.0, "fader_b": 0.0, "low_a": 0.5, "low_b": 0.5, "mid_a": 0.5, "mid_b": 0.5,
           "hi_a": 0.5, "hi_b": 0.5, "cfx_a": 0.5, "cfx_b": 0.5, "echo": 0.0, "loop": 0.0, "crossfader": 0.5}
# 9 Uhr / 10 Uhr / 3 Uhr / 4 Uhr auf der Skala 7 Uhr (0) … 5 Uhr (1)
H9, H10, H3, H4 = 0.2, 0.3, 0.8, 0.9


def recipe(template: str, n: int) -> dict[str, Points]:
    """Kurven der Vorlage für einen Übergang über n Takte (nur Regler, die sich bewegen)."""
    h, q = n / 2, n / 4
    swap = {"low_a": [[0, 0.5], [h, 0.5], [h, 0]], "low_b": [[0, 0], [h, 0], [h, 0.5]]}
    if template == "fade":
        return {"fader_a": [[0, 1], [n, 0]], "fader_b": [[0, 0], [n, 1]], **swap}
    if template == "blend":
        return {
            "fader_b": [[0, 0], [q, 1]],
            "hi_b": [[0, H9], [q, 0.5]], "hi_a": [[q, 0.5], [h, H9]],
            "mid_b": [[0, H10], [q, H10], [h, 0.5]], "mid_a": [[h, 0.5], [3 * q, H9]],
            **swap,
            "fader_a": [[3 * q, 1], [n, 0]],
        }
    if template == "rise":
        return {
            "fader_b": [[0, 0], [q, 0.9], [h, 1]],
            "cfx_b": [[0, H9], [h, 0.5]],
            **swap,
            "cfx_a": [[h, 0.5], [n, H4]],
            "fader_a": [[3 * q, 1], [n, 0]],
        }
    if template == "bass_swap":
        return {"fader_b": [[0, 0], [h, 1]], **swap, "mid_a": [[h, 0.5], [3 * q, H9]], "fader_a": [[h, 1], [n, 0]]}
    if template == "echo_out":
        return {"echo": [[0, 0], [0, 1], [n, 1], [n, 0]], "fader_a": [[n - 0.25, 1], [n, 0]], "fader_b": [[n, 0], [n, 1]]}
    if template == "loop_out":
        return {"loop": [[0, 0], [0, 1], [n, 1], [n, 0]], "fader_b": [[0, 0], [h, 1]], **swap, "fader_a": [[h, 1], [n, 0]]}
    if template == "cut":
        return {"fader_b": [[0, 1], [n, 1]], "crossfader": [[0, 0], [n, 0], [n, 1]]}
    if template == "smart_fader":
        return {"fader_b": [[0, 1], [n, 1]], "crossfader": [[0, 0], [n, 1]]}
    raise ValueError(template)


def value_at(points: Points, bar: float) -> float:
    """Wert einer Kurve zum Takt `bar` (linear zwischen den Punkten, vorher/nachher konstant)."""
    if bar <= points[0][0]:
        return points[0][1]
    for (b0, v0), (b1, v1) in zip(points, points[1:]):
        if b0 <= bar < b1:
            return v0 + (v1 - v0) * (bar - b0) / (b1 - b0)
    return points[-1][1]


def control_id(lane: str, deck_a: int, deck_b: int) -> str:
    """Kennung des Bedienelements im Controller-Schema zu einer Kurve."""
    if lane == "echo":
        return "beatfx_onoff"
    if lane == "loop":
        return f"loop4_{deck_a}"
    if lane == "crossfader":
        return lane
    name, side = lane.rsplit("_", 1)
    return f"{name}_{deck_a if side == 'a' else deck_b}"


GROUPS = [("Lautstärke", "Kanalfader", "fader"), ("Höhen", "EQ HI", "hi"), ("Mitten", "EQ MID", "mid"),
          ("Bass", "EQ LOW", "low"), ("Filter", "CFX · Mitte = neutral", "cfx")]


def build(template: str, bars: int, deck_a: int, deck_b: int) -> dict:
    """Automation für die Oberfläche: Kurven je Bedienelement plus Gruppen für das Diagramm."""
    n = max(bars, 1)
    curves = recipe(template, n)
    controls = {control_id(lane, deck_a, deck_b): pts for lane, pts in curves.items()}
    # Ruhestellung aller übrigen Regler, damit die Animation vollständige Stellungen zeigen kann
    rest = {control_id(lane, deck_a, deck_b): v for lane, v in NEUTRAL.items() if lane not in curves and lane not in ("echo", "loop")}
    if "crossfader" in curves:  # Crossfader-Übergänge: beide Kanalfader offen
        rest[f"fader_{deck_a}"] = 1.0
    groups = []
    for label, hint, name in GROUPS:
        a, b = curves.get(f"{name}_a"), curves.get(f"{name}_b")
        if a or b:
            groups.append({"label": label, "hint": hint, "a": a, "b": b})
    if "crossfader" in curves:
        groups.append({"label": "Crossfader", "hint": f"links = Deck {min(deck_a, deck_b)}", "b": curves["crossfader"], "a": None})
    for lane, label, hint in (("echo", "Echo", f"BEAT FX auf Deck {deck_a}"), ("loop", "Loop", f"4 BEAT/EXIT auf Deck {deck_a}")):
        if lane in curves:
            groups.append({"label": label, "hint": hint, "band": [0, n]})
    return {"bars": n, "controls": controls, "rest": rest, "groups": groups,
            "b_start_bar": n if template in ("echo_out", "cut") else 0}
