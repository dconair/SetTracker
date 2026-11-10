"""Übergangsplan → Bedienschritte am Pioneer DDJ-FLX4 (rekordbox).

Jeder Schritt nennt die beteiligten Bedienelemente (`controls`), damit die Oberfläche sie
im Controller-Schema hervorheben kann. Kennungen: <element>_<deck> bzw. ohne Deck für
Elemente, die es nur einmal gibt (browse, crossfader, smart_fader, beatfx_*).
"""
from __future__ import annotations


def _step(when: str, text: str, deck: int | None = None, controls: list[str] | None = None) -> dict:
    return {"when": when, "deck": deck, "text": text, "controls": controls or []}


def _estimate_out(a: dict, bars: int) -> str | None:
    """Ohne Audiodatei: grobe Zeitangabe für den Ausstieg (Phrasenraster ab Trackbeginn)."""
    bpm, duration = a.get("bpm"), a.get("duration") or 0
    if not bpm or duration < 90:
        return None
    bar_len = 240.0 / bpm
    total = int(duration / bar_len)
    out_bar = max(0, total - max(bars, 16) - 16)
    out_bar -= out_bar % 16
    t = out_bar * bar_len
    return f"{int(t // 60)}:{int(t % 60):02d}"


def _prep(plan: dict, a: dict, b: dict) -> list[dict]:
    db = plan["deck_b"]
    steps = [_step("Vorbereitung", f"„{b['title']}“ mit dem Browse-Regler auswählen und mit LOAD auf Deck {db} laden.", db, ["browse", f"load_{db}"])]
    if plan["precise"]:
        pad = plan["cues_b"][0]["pad"]
        steps.append(_step("Vorbereitung", f"Deck {db}: Hot-Cue-Pad {pad} (MIX IN, {plan['mix_in']['label']}) drücken – der Track steht am Einstiegspunkt.", db, [f"pad{pad}_{db}"]))
    else:
        steps.append(_step("Vorbereitung", f"Deck {db}: Track mit dem Jogwheel an den ersten Kick (die Eins) fahren und CUE drücken.", db, [f"jog_{db}", f"cue_{db}"]))
    tempo = plan.get("tempo")
    if tempo and plan["template"] != "smart_fader":
        if abs(tempo["pct"]) < 0.15:
            steps.append(_step("Vorbereitung", f"Tempo passt bereits ({tempo['target_bpm']:g} BPM). BEAT SYNC auf Deck {db} zur Sicherheit aktivieren.", db, [f"sync_{db}"]))
        else:
            text = f"Deck {db}: BEAT SYNC drücken oder den TEMPO-Slider auf {tempo['pct']:+.1f} % stellen (≈ {tempo['target_bpm']:g} BPM)."
            if not tempo["in_range"]:
                text += " Der Standardbereich ±6 % reicht nicht: vorher mit SHIFT + BEAT SYNC den Tempobereich auf ±10 % bzw. ±16 % erweitern."
            if tempo["factor"] != 1:
                text += " Hinweis: Die Tracks laufen im Halb-/Doppeltempo-Verhältnis – in rekordbox ggf. das Beatgrid von B halbieren/verdoppeln."
            steps.append(_step("Vorbereitung", text, db, [f"sync_{db}", f"tempo_{db}"]))
    steps.append(_step("Vorbereitung", f"Kanalfader Deck {db} ganz unten, Kopfhörer-CUE für Kanal {db} an; TRIM so einstellen, dass beide Kanäle gleich laut aussteuern.", db,
                       [f"fader_{db}", f"hpcue_{db}", f"trim_{db}"]))
    return steps


def steps_for(plan: dict, a: dict, b: dict) -> list[dict]:
    da, db = plan["deck_a"], plan["deck_b"]
    bars, t = plan["bars"], plan["template"]
    if plan["precise"]:
        at_out = f"Deck {da} bei {plan['mix_out']['label']} (Takt {plan['mix_out']['bar']}, Hot Cue MIX OUT)"
    else:
        est = _estimate_out(a, bars)
        at_out = f"Wenn auf Deck {da} das Outro beginnt" + (f" (geschätzt um {est}, auf einer Eins)" if est else f" (ca. {max(bars, 8)} Takte vor Schluss, auf einer Eins)")
    steps = _prep(plan, a, b)
    half = max(bars // 2, 1)

    if t == "bass_swap":
        steps += [
            _step("Vorbereitung", f"EQ LOW auf Deck {db} ganz nach links (Bass raus), MID und HI auf 12 Uhr.", db, [f"low_{db}"]),
            _step("Takt 1", f"{at_out}: PLAY auf Deck {db} genau auf die Eins. Im Kopfhörer prüfen, dass die Kicks übereinander liegen; bei Bedarf am Jogwheel-Rand leicht nachschieben.", db, [f"play_{db}", f"jog_{db}"]),
            _step(f"Takt 1–{half}", f"Kanalfader Deck {db} gleichmäßig bis ganz nach oben schieben.", db, [f"fader_{db}"]),
            _step(f"Takt {half + 1}", f"Bass-Swap auf der Eins: EQ LOW Deck {da} zügig ganz nach links, gleichzeitig EQ LOW Deck {db} auf 12 Uhr.", None, [f"low_{da}", f"low_{db}"]),
            _step(f"Takt {half + 1}–{bars}", f"Deck {da} ausdünnen: erst MID auf 9 Uhr, dann Kanalfader Deck {da} langsam herunterziehen.", da, [f"mid_{da}", f"fader_{da}"]),
            _step(f"Nach Takt {bars}", f"Kanalfader Deck {da} ganz unten, PAUSE. EQ auf Deck {da} wieder auf 12 Uhr stellen.", da, [f"fader_{da}", f"play_{da}", f"low_{da}", f"mid_{da}"]),
        ]
    elif t == "filter_fade":
        steps += [
            _step("Vorbereitung", f"CFX-Regler Deck {db} auf ca. 9 Uhr (Low-Pass) drehen.", db, [f"cfx_{db}"]),
            _step("Takt 1", f"{at_out}: PLAY auf Deck {db} auf die Eins, Kanalfader Deck {db} auf etwa 3/4.", db, [f"play_{db}", f"fader_{db}"]),
            _step(f"Takt 1–{half}", f"CFX Deck {db} langsam zurück auf 12 Uhr, gleichzeitig CFX Deck {da} nach rechts Richtung 3 Uhr (High-Pass) drehen.", None, [f"cfx_{db}", f"cfx_{da}"]),
            _step(f"Takt {half + 1}–{bars}", f"Kanalfader Deck {db} ganz hoch, Kanalfader Deck {da} herunterziehen.", None, [f"fader_{db}", f"fader_{da}"]),
            _step(f"Nach Takt {bars}", f"Deck {da} pausieren und CFX Deck {da} zurück auf 12 Uhr.", da, [f"play_{da}", f"cfx_{da}"]),
        ]
    elif t == "echo_out":
        steps += [
            _step("Vorbereitung", f"BEAT FX: mit BEAT FX SELECT „ECHO“ wählen, Kanalwahlschalter auf {da}, mit BEAT ◀/▶ auf 1/2 Beat, LEVEL/DEPTH auf 12 Uhr.", da,
                  ["beatfx_select", "beatfx_ch", "beatfx_beat", "beatfx_depth"]),
            _step("Takt 1", f"{at_out}: BEAT FX ON/OFF drücken – Deck {da} bekommt ein Echo.", da, ["beatfx_onoff"]),
            _step(f"Takt {max(bars, 1)}", f"Auf der letzten Zählzeit den Kanalfader Deck {da} schnell schließen – das Echo klingt aus.", da, [f"fader_{da}"]),
            _step(f"Takt {max(bars, 1) + 1}", f"Genau auf die nächste Eins PLAY auf Deck {db} mit Kanalfader oben.", db, [f"play_{db}", f"fader_{db}"]),
            _step("Danach", f"BEAT FX wieder ausschalten, Deck {da} pausieren.", da, ["beatfx_onoff", f"play_{da}"]),
        ]
    elif t == "loop_out":
        steps += [
            _step("Vorbereitung", f"EQ LOW auf Deck {db} ganz nach links.", db, [f"low_{db}"]),
            _step("Takt 1", f"{at_out}: 4 BEAT/EXIT auf Deck {da} drücken – der letzte volle Takt läuft als Schleife weiter.", da, [f"loop4_{da}"]),
            _step("Takt 1", f"PLAY auf Deck {db} auf die Eins, Kanalfader Deck {db} über {half} Takte hochziehen.", db, [f"play_{db}", f"fader_{db}"]),
            _step(f"Takt {half + 1}", f"Bass-Swap: EQ LOW Deck {da} raus, EQ LOW Deck {db} auf 12 Uhr.", None, [f"low_{da}", f"low_{db}"]),
            _step(f"Takt {half + 1}–{bars}", f"Kanalfader Deck {da} herunterziehen; optional mit CUE/LOOP CALL ◀ die Schleife halbieren für einen Spannungsaufbau.", da, [f"fader_{da}", f"loopcall_{da}"]),
            _step(f"Nach Takt {bars}", f"Deck {da} pausieren, Loop mit 4 BEAT/EXIT beenden, EQ zurück auf 12 Uhr.", da, [f"play_{da}", f"loop4_{da}", f"low_{da}"]),
        ]
    elif t == "cut":
        steps += [
            _step("Vorbereitung", f"Kanalfader Deck {db} ganz oben lassen, Crossfader ganz auf die Seite von Deck {da}.", db, [f"fader_{db}", "crossfader"]),
            _step("Takt 1", f"{at_out}: letzten Takt mitzählen (1-2-3-4).", da, []),
            _step("Die Eins", f"Auf die nächste Eins PLAY auf Deck {db} und Crossfader in einem Zug auf die Seite von Deck {db}.", db, [f"play_{db}", "crossfader"]),
            _step("Danach", f"Deck {da} pausieren und Crossfader zurück in die Mitte, sobald Kanalfader Deck {da} unten ist.", da, [f"play_{da}", "crossfader", f"fader_{da}"]),
        ]
    elif t == "smart_fader":
        steps += [
            _step("Vorbereitung", "SMART FADER-Taste drücken (leuchtet). rekordbox gleicht Tempo, Bass und Lautstärke beim Überblenden automatisch an.", None, ["smart_fader"]),
            _step("Takt 1", f"{at_out}: PLAY auf Deck {db} auf die Eins.", db, [f"play_{db}"]),
            _step(f"Takt 1–{bars}", f"Crossfader gleichmäßig über {bars} Takte von Deck {da} zu Deck {db} schieben.", None, ["crossfader"]),
            _step(f"Nach Takt {bars}", f"Deck {da} pausieren, SMART FADER wieder ausschalten und Crossfader in die Mitte.", da, [f"play_{da}", "smart_fader", "crossfader"]),
            _step("Alternative", f"Ohne Smart Fader: Echo-Out auf Deck {da} und „{b['title']}“ frisch auf der Eins starten.", None, ["beatfx_onoff", f"play_{db}"]),
        ]
    if not plan["precise"]:
        steps.append(_step("Hinweis", "Mindestens einer der beiden Tracks liegt nur bei Spotify vor – ohne Audiodatei gibt es keine taktgenauen Marken. Zeitangaben sind Schätzungen aus Tempo und Länge; Mix-Punkte bitte nach Gehör und Waveform in rekordbox setzen."))
    return steps
