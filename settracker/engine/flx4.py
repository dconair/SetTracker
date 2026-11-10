"""Übergangsplan → Bedienschritte am Pioneer DDJ-FLX4 (rekordbox)."""
from __future__ import annotations


def _step(when: str, text: str, deck: int | None = None) -> dict:
    return {"when": when, "deck": deck, "text": text}


def _prep(plan: dict, a: dict, b: dict) -> list[dict]:
    da, db = plan["deck_a"], plan["deck_b"]
    steps = [_step("Vorbereitung", f"„{b['title']}“ mit dem Browse-Regler auswählen und mit LOAD auf Deck {db} laden.", db)]
    if plan["precise"]:
        steps.append(_step("Vorbereitung", f"Deck {db}: Hot-Cue-Pad {plan['cues_b'][0]['pad']} (MIX IN, {plan['mix_in']['label']}) drücken – der Track steht am Einstiegspunkt.", db))
    else:
        steps.append(_step("Vorbereitung", f"Deck {db}: Track an den ersten Kick (die Eins) fahren und CUE drücken.", db))
    tempo = plan.get("tempo")
    if tempo and plan["template"] != "smart_fader":
        if abs(tempo["pct"]) < 0.15:
            steps.append(_step("Vorbereitung", f"Tempo passt bereits ({tempo['target_bpm']:g} BPM). BEAT SYNC auf Deck {db} zur Sicherheit aktivieren.", db))
        else:
            text = f"Deck {db}: BEAT SYNC drücken oder den TEMPO-Slider auf {tempo['pct']:+.1f} % stellen (≈ {tempo['target_bpm']:g} BPM)."
            if not tempo["in_range"]:
                text += " Der Standardbereich ±6 % reicht nicht: vorher mit SHIFT + BEAT SYNC den Tempobereich auf ±10 % bzw. ±16 % erweitern."
            if tempo["factor"] != 1:
                text += " Hinweis: Die Tracks laufen im Halb-/Doppeltempo-Verhältnis – in rekordbox ggf. das Beatgrid von B halbieren/verdoppeln."
            steps.append(_step("Vorbereitung", text, db))
    steps.append(_step("Vorbereitung", f"Kanalfader Deck {db} ganz unten, Kopfhörer-CUE für Kanal {db} an; TRIM so einstellen, dass beide Kanäle gleich laut aussteuern.", db))
    return steps


def steps_for(plan: dict, a: dict, b: dict) -> list[dict]:
    da, db = plan["deck_a"], plan["deck_b"]
    bars, t = plan["bars"], plan["template"]
    at_out = f"Deck {da} bei {plan['mix_out']['label']} (Takt {plan['mix_out']['bar']}, Hot Cue MIX OUT)" if plan["precise"] else f"Wenn auf Deck {da} das Outro beginnt (ca. {max(bars, 8)} Takte vor Schluss, auf einer Eins)"
    steps = _prep(plan, a, b)
    half = max(bars // 2, 1)

    if t == "bass_swap":
        steps += [
            _step("Vorbereitung", f"EQ LOW auf Deck {db} ganz nach links (Bass raus), MID und HI auf 12 Uhr.", db),
            _step("Takt 1", f"{at_out}: PLAY auf Deck {db} genau auf die Eins. Im Kopfhörer prüfen, dass die Kicks übereinander liegen; bei Bedarf am Jogwheel-Rand leicht nachschieben.", db),
            _step(f"Takt 1–{half}", f"Kanalfader Deck {db} gleichmäßig bis ganz nach oben schieben.", db),
            _step(f"Takt {half + 1}", f"Bass-Swap auf der Eins: EQ LOW Deck {da} zügig ganz nach links, gleichzeitig EQ LOW Deck {db} auf 12 Uhr.", None),
            _step(f"Takt {half + 1}–{bars}", f"Deck {da} ausdünnen: erst MID auf 9 Uhr, dann Kanalfader Deck {da} langsam herunterziehen.", da),
            _step(f"Nach Takt {bars}", f"Kanalfader Deck {da} ganz unten, PAUSE. EQ auf Deck {da} wieder auf 12 Uhr stellen.", da),
        ]
    elif t == "filter_fade":
        steps += [
            _step("Vorbereitung", f"CFX-Regler Deck {db} auf ca. 9 Uhr (Low-Pass) drehen.", db),
            _step("Takt 1", f"{at_out}: PLAY auf Deck {db} auf die Eins, Kanalfader Deck {db} auf etwa 3/4.", db),
            _step(f"Takt 1–{half}", f"CFX Deck {db} langsam zurück auf 12 Uhr, gleichzeitig CFX Deck {da} nach rechts Richtung 3 Uhr (High-Pass) drehen.", None),
            _step(f"Takt {half + 1}–{bars}", f"Kanalfader Deck {db} ganz hoch, Kanalfader Deck {da} herunterziehen.", None),
            _step(f"Nach Takt {bars}", f"Deck {da} pausieren und CFX Deck {da} zurück auf 12 Uhr.", da),
        ]
    elif t == "echo_out":
        steps += [
            _step("Vorbereitung", f"BEAT FX: mit BEAT FX SELECT „ECHO“ wählen, Kanalwahlschalter auf {da}, mit BEAT ◀/▶ auf 1/2 Beat, LEVEL/DEPTH auf 12 Uhr.", da),
            _step("Takt 1", f"{at_out}: BEAT FX ON/OFF drücken – Deck {da} bekommt ein Echo.", da),
            _step(f"Takt {max(bars, 1)}", f"Auf der letzten Zählzeit den Kanalfader Deck {da} schnell schließen – das Echo klingt aus.", da),
            _step(f"Takt {max(bars, 1) + 1}", f"Genau auf die nächste Eins PLAY auf Deck {db} mit Kanalfader oben.", db),
            _step("Danach", f"BEAT FX wieder ausschalten, Deck {da} pausieren.", da),
        ]
    elif t == "loop_out":
        steps += [
            _step("Vorbereitung", f"EQ LOW auf Deck {db} ganz nach links.", db),
            _step("Takt 1", f"{at_out}: 4 BEAT LOOP auf Deck {da} drücken – der letzte volle Takt läuft als Schleife weiter.", da),
            _step("Takt 1", f"PLAY auf Deck {db} auf die Eins, Kanalfader Deck {db} über {half} Takte hochziehen.", db),
            _step(f"Takt {half + 1}", f"Bass-Swap: EQ LOW Deck {da} raus, EQ LOW Deck {db} auf 12 Uhr.", None),
            _step(f"Takt {half + 1}–{bars}", f"Kanalfader Deck {da} herunterziehen; optional mit CUE/LOOP CALL ◀ die Schleife halbieren für einen Spannungsaufbau.", da),
            _step(f"Nach Takt {bars}", f"Deck {da} pausieren, Loop mit 4 BEAT/EXIT beenden, EQ zurück auf 12 Uhr.", da),
        ]
    elif t == "cut":
        steps += [
            _step("Vorbereitung", f"Kanalfader Deck {db} ganz oben lassen, Crossfader ganz auf die Seite von Deck {da}.", db),
            _step("Takt 1", f"{at_out}: letzten Takt mitzählen (1-2-3-4).", da),
            _step("Die Eins", f"Auf die nächste Eins PLAY auf Deck {db} und Crossfader in einem Zug auf die Seite von Deck {db}.", db),
            _step("Danach", f"Deck {da} pausieren und Crossfader zurück in die Mitte, sobald Kanalfader Deck {da} unten ist.", da),
        ]
    elif t == "smart_fader":
        steps += [
            _step("Vorbereitung", "SMART FADER-Taste drücken (leuchtet). rekordbox gleicht Tempo, Bass und Lautstärke beim Überblenden automatisch an.", None),
            _step("Takt 1", f"{at_out}: PLAY auf Deck {db} auf die Eins.", db),
            _step(f"Takt 1–{bars}", f"Crossfader gleichmäßig über {bars} Takte von Deck {da} zu Deck {db} schieben.", None),
            _step(f"Nach Takt {bars}", f"Deck {da} pausieren, SMART FADER wieder ausschalten und Crossfader in die Mitte.", da),
            _step("Alternative", f"Ohne Smart Fader: Echo-Out auf Deck {da} und „{b['title']}“ frisch auf der Eins starten.", None),
        ]
    if not plan["precise"]:
        steps.append(_step("Hinweis", "Mindestens einer der beiden Tracks liegt nur bei Spotify vor – ohne Audiodatei gibt es keine taktgenauen Marken. Mix-Punkte bitte nach Gehör/Waveform in rekordbox setzen."))
    return steps
