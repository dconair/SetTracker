"""Übergang A→B planen: Vorlage wählen, Mix-Punkte bestimmen."""
from __future__ import annotations

from ..music import key_relation
from .compat import section_bars, tempo_match

TEMPLATES = {
    "bass_swap": "Bass-Swap-Blend",
    "filter_fade": "Filter-Fade",
    "echo_out": "Echo-Out",
    "loop_out": "Loop-Out",
    "cut": "Cut auf die Eins",
    "smart_fader": "Smart-Fader-Übergang",
}


def _snap_len(bars: int) -> int:
    for size in (32, 16, 8, 4):
        if bars >= size:
            return size
    return 0


def _fmt(seconds: float) -> str:
    seconds = max(0.0, seconds)
    return f"{int(seconds // 60)}:{seconds % 60:04.1f}"


def _bar_time(track: dict, bar: int) -> float:
    an = track["analysis"]
    return float(an["first_downbeat"] + bar * an["bar_len"])


def choose_template(a: dict, b: dict) -> tuple[str, str]:
    """Vorlage plus Begründung anhand von Tempo, Tonart, Energie und Struktur."""
    tm = tempo_match(a.get("bpm"), b.get("bpm"))
    key, _ = key_relation(a.get("camelot"), b.get("camelot"))
    precise = bool(a.get("analysis") and b.get("analysis"))
    outro, intro = section_bars(a, "outro"), section_bars(b, "intro")
    jump = (b.get("energy") or 0) - (a.get("energy") or 0) if a.get("energy") is not None and b.get("energy") is not None else 0

    if tm and abs(tm["pct"]) > 8:
        return "smart_fader", f"Tempo liegt {abs(tm['pct']):.0f} % auseinander – zu viel zum sauberen Angleichen."
    if key is not None and key < 0.3:
        return "echo_out", "Die Tonarten beißen sich – kurzer Übergang ohne lange Überlagerung."
    if precise:
        if intro < 4 and jump > 0.12:
            return "cut", "B startet ohne Intro direkt mit voller Energie."
        if outro < 8 <= intro:
            return "loop_out", f"A hat nur {outro} Takte Outro, B aber {intro} Takte Intro – A per Loop verlängern."
        if min(outro, intro) < 4:
            return "echo_out", "Zu wenig Outro/Intro zum Überblenden."
        if min(outro, intro) >= 8 and (key is None or key >= 0.6):
            return "bass_swap", f"{min(outro, intro)} Takte Outro/Intro und passende Tonart – klassischer Blend."
        return "filter_fade", "Kurze Überlappung – mit dem Filter weich überblenden."
    if key is None or key >= 0.6:
        return "bass_swap", "Tempo und Tonart passen – klassischer Blend."
    return "filter_fade", "Tonart passt nur mäßig – mit dem Filter kurz überblenden."


def plan(a: dict, b: dict, deck_a: int = 1, template: str | None = None) -> dict:
    """Vollständiger Übergangsplan inkl. Mix-Punkten, Cues und FLX4-Schritten."""
    from .flx4 import steps_for

    auto, why = choose_template(a, b)
    if template not in TEMPLATES:
        template = auto
    elif template != auto:
        why = "Manuell gewählt."
    precise = bool(a.get("analysis") and b.get("analysis"))
    tm = tempo_match(a.get("bpm"), b.get("bpm"))
    out: dict = {
        "template": template,
        "title": TEMPLATES[template],
        "suggested": auto,
        "why": why,
        "precise": precise,
        "deck_a": deck_a,
        "deck_b": 2 if deck_a == 1 else 1,
        "tempo": None,
        "cues_a": [],
        "cues_b": [],
    }
    if tm and abs(tm["pct"]) <= 16:
        target = a["bpm"] / tm["factor"]  # Tempo, auf das B gestellt wird
        out["tempo"] = {
            "pct": round((target / b["bpm"] - 1) * 100, 1),
            "target_bpm": round(target, 1),
            "factor": tm["factor"],
            "in_range": abs(target / b["bpm"] - 1) <= 0.06,
        }

    bars = {"bass_swap": 16, "filter_fade": 8, "echo_out": 2, "loop_out": 8, "cut": 0, "smart_fader": 8}[template]
    if precise:
        outro, intro = section_bars(a, "outro"), section_bars(b, "intro")
        n_a = a["analysis"]["n_bars"]
        if template == "bass_swap":
            bars = _snap_len(min(outro, intro)) or 8
        elif template == "filter_fade":
            bars = min(8, _snap_len(min(outro or 8, intro or 8)) or 4)
        elif template == "loop_out":
            bars = min(_snap_len(intro) or 8, 16)

        # Mix-Out in A: Beginn des Outros (bzw. so, dass der Blend vor Trackende fertig ist)
        if template == "loop_out":
            out_bar = max(0, (n_a - outro) - 1)  # letzter voller Takt vor dem Outro wird geloopt
        elif template == "cut":
            out_bar = max(0, n_a - outro) if outro else max(0, n_a - 1)
        elif template == "echo_out":
            out_bar = max(0, (n_a - outro) + min(outro, 8) - bars) if outro >= 4 else max(0, n_a - 4)
        else:
            out_bar = max(0, n_a - outro) if outro >= bars else max(0, n_a - bars - 1)
        out_bar -= out_bar % 4 if template != "loop_out" and out_bar % 4 and out_bar > 4 else 0

        # Mix-In in B: so starten, dass der Hauptteil von B am Ende des Blends einsetzt
        if template in ("cut", "echo_out", "smart_fader"):
            in_bar = 0 if template != "cut" else intro
        else:
            in_bar = max(0, intro - bars)
            in_bar -= in_bar % 4
        drop_bar = intro

        out["mix_out"] = {"bar": out_bar + 1, "time": round(_bar_time(a, out_bar), 2), "label": _fmt(_bar_time(a, out_bar))}
        out["mix_in"] = {"bar": in_bar + 1, "time": round(_bar_time(b, in_bar), 2), "label": _fmt(_bar_time(b, in_bar))}
        out["end"] = {"time": round(_bar_time(a, out_bar + max(bars, 1)), 2)}
        out["cues_a"] = [{"pad": 8, "name": "MIX OUT", "time": out["mix_out"]["time"], "label": out["mix_out"]["label"]}]
        if template == "bass_swap":
            t = _bar_time(a, out_bar + bars // 2)
            out["cues_a"].append({"pad": 7, "name": "BASS SWAP", "time": round(t, 2), "label": _fmt(t)})
        out["cues_b"] = [{"pad": 1, "name": "MIX IN", "time": out["mix_in"]["time"], "label": out["mix_in"]["label"]}]
        if drop_bar > in_bar:
            t = _bar_time(b, drop_bar)
            out["cues_b"].append({"pad": 2, "name": "DROP", "time": round(t, 2), "label": _fmt(t)})
    out["bars"] = bars
    out["steps"] = steps_for(out, a, b)
    return out
