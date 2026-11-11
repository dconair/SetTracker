"""Lerninhalte: Übergangsarten mit Erklärung und allgemeinen Übungsschritten am DDJ-FLX4."""
from __future__ import annotations

from . import transitions

GUIDE = {
    "bass_swap": {
        "difficulty": 2,
        "summary": "Der Standard-Übergang: Beide Tracks laufen eine Weile gemeinsam, der Bass wechselt in einem Schlag von A nach B.",
        "when": "Tempo ähnlich (bis ca. 6 %), Tonarten verträglich, A hat ein Outro und B ein Intro von mindestens 8 Takten.",
        "listen": "Vor dem Tausch darf nur ein Bass zu hören sein – zwei Bässe gleichzeitig klingen matschig. Der Tausch sitzt, wenn er genau auf die Eins einer neuen Phrase fällt.",
        "mistakes": ["Bass von B schon vor dem Tausch aufgedreht", "Tausch mitten in der Phrase statt auf der Eins", "Kanalfader von A zu früh geschlossen – der Übergang wirkt abgehackt"],
    },
    "filter_fade": {
        "difficulty": 1,
        "summary": "B kommt gedämpft herein und wird heller, während A über den Filter dünner wird und verschwindet.",
        "when": "Kurze Überlappung (4–8 Takte) oder Tonarten, die nur mäßig zusammenpassen.",
        "listen": "Der CFX-Regler in der Mitte ist neutral. Links nimmt er Höhen weg (dumpf), rechts den Bass (dünn). Dreh langsam und gleichmäßig.",
        "mistakes": ["CFX nach dem Übergang nicht zurück auf 12 Uhr gestellt", "Zu schnell gedreht – der Effekt wird zum Gimmick"],
    },
    "echo_out": {
        "difficulty": 1,
        "summary": "A verabschiedet sich mit einem Echo, B startet frisch auf der nächsten Eins. Keine lange Überlagerung.",
        "when": "Tonarten beißen sich, A hat kein brauchbares Outro oder du willst einen klaren Schnitt mit weichem Ausklang.",
        "listen": "Das Echo übernimmt nur, was beim Einschalten gerade läuft. Schließ den Fader von A erst, wenn das Echo zu hören ist, und starte B exakt auf die Eins.",
        "mistakes": ["BEAT FX noch auf dem falschen Kanal", "B einen Schlag zu spät gestartet – es entsteht ein Loch", "Echo danach nicht ausgeschaltet"],
    },
    "loop_out": {
        "difficulty": 2,
        "summary": "A ist zu kurz zum Mischen: Du hältst den letzten Takt als Schleife fest und gewinnst so Zeit für den Blend.",
        "when": "A endet abrupt oder hat nur wenige Takte Outro, B braucht ein längeres Intro.",
        "listen": "Setz den Loop auf einen Takt, in dem möglichst nur Schlagzeug läuft. Eine Melodie in der Schleife fällt sofort auf.",
        "mistakes": ["Loop mitten im Takt gesetzt – er eiert", "Loop am Ende nicht verlassen", "Zu lange geloopt: nach 16 Takten wirkt es wie ein Hänger"],
    },
    "cut": {
        "difficulty": 3,
        "summary": "Harter Schnitt: A ist weg, B ist da – auf einen Schlag. Wirkt nur, wenn das Timing stimmt.",
        "when": "B beginnt direkt mit voller Energie (kein Intro) oder du willst bewusst einen Bruch setzen, z. B. beim Genrewechsel.",
        "listen": "Zähl die letzte Phrase von A laut mit. Der Schnitt gehört auf die Eins der nächsten Phrase, nicht irgendwo dazwischen.",
        "mistakes": ["Einen Schlag zu früh oder zu spät geschnitten", "Lautstärke von B nicht angeglichen – der Sprung erschreckt"],
    },
    "smart_fader": {
        "difficulty": 1,
        "summary": "Die Automatik des FLX4: Beim Schieben des Crossfaders gleicht rekordbox Tempo, Bass und Lautstärke selbst an.",
        "when": "Großer Tempounterschied (z. B. House zu Drum & Bass) oder als Hilfe, solange das Angleichen von Hand noch nicht sitzt.",
        "listen": "Schieb den Crossfader gleichmäßig über mehrere Takte. Smart Fader verändert das Tempo hörbar – bei kleinen Unterschieden klingt ein Blend von Hand besser.",
        "mistakes": ["SMART FADER danach nicht ausgeschaltet", "Crossfader ruckartig bewegt"],
    },
}


def lessons() -> list[dict]:
    """Alle Übergangsarten mit Erklärung und allgemeinen Schritten (ohne konkrete Tracks)."""
    a = {"title": "Track A", "artist": "", "bpm": 124.0, "camelot": "8A", "energy": 0.6, "duration": 0, "analysis": None}
    b = {"title": "Track B", "artist": "", "bpm": 126.0, "camelot": "9A", "energy": 0.65, "duration": 0, "analysis": None}
    out = []
    for key, title in transitions.TEMPLATES.items():
        plan = transitions.plan(a, b, deck_a=1, template=key)
        steps = [s for s in plan["steps"] if s["when"] != "Hinweis"]
        out.append({"key": key, "title": title, "bars": plan["bars"], "bpm": 124, "steps": steps, **GUIDE[key]})
    out.sort(key=lambda lesson: lesson["difficulty"])
    return out
