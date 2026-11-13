"""Musikalische Hilfen: Camelot-Rad, Genre-Familien, Stimmung."""
from __future__ import annotations

import re

PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# Camelot-Nummer je Tonhöhenklasse (0 = C)
_MAJOR = {0: 8, 7: 9, 2: 10, 9: 11, 4: 12, 11: 1, 6: 2, 1: 3, 8: 4, 3: 5, 10: 6, 5: 7}
_MINOR = {9: 8, 4: 9, 11: 10, 6: 11, 1: 12, 8: 1, 3: 2, 10: 3, 5: 4, 0: 5, 7: 6, 2: 7}


def to_camelot(pitch_class: int, major: bool) -> str:
    return f"{(_MAJOR if major else _MINOR)[pitch_class % 12]}{'B' if major else 'A'}"


def key_name(camelot: str | None) -> str:
    parsed = parse_camelot(camelot)
    if not parsed:
        return ""
    num, letter = parsed
    table = _MAJOR if letter == "B" else _MINOR
    pc = next(p for p, n in table.items() if n == num)
    return f"{PITCHES[pc]}{'' if letter == 'B' else 'm'}"


def parse_camelot(camelot: str | None) -> tuple[int, str] | None:
    m = re.fullmatch(r"\s*(\d{1,2})([ABab])\s*", camelot or "")
    if not m or not 1 <= int(m.group(1)) <= 12:
        return None
    return int(m.group(1)), m.group(2).upper()


def key_relation(a: str | None, b: str | None) -> tuple[float | None, str]:
    """Score (0–1) und Beschreibung für den Tonartwechsel a → b."""
    pa, pb = parse_camelot(a), parse_camelot(b)
    if not pa or not pb:
        return None, "Tonart unbekannt"
    (na, la), (nb, lb) = pa, pb
    step = (nb - na) % 12
    label = f"{na}{la}→{nb}{lb}"
    if step == 0 and la == lb:
        return 1.0, f"{label} gleiche Tonart"
    if step == 0:
        return 0.9, f"{label} Dur/Moll-Parallele"
    if la == lb and step in (1, 11):
        return 0.9, f"{label} Nachbartonart"
    if la != lb and step in (1, 11):
        # Diagonale auf dem Camelot-Rad: die Tonleitern teilen 6 von 7 Tönen
        return 0.7, f"{label} diagonal verwandt"
    if la == lb and step == 2:
        return 0.6, f"{label} Energie-Boost (+2)"
    if la == lb and step == 7:
        return 0.6, f"{label} Energie-Boost (+1 Halbton)"
    if la == lb and step == 10:
        return 0.45, f"{label} zwei Schritte zurück"
    return 0.15, f"{label} Tonart-Clash"


# Reihenfolge = Priorität: spezifische Familien vor allgemeinen.
FAMILIES: list[tuple[str, tuple[str, ...]]] = [
    ("Drum & Bass", ("drum and bass", "drum & bass", "drum n bass", "dnb", "d&b", "jungle", "liquid funk", "neurofunk", "jump up")),
    ("Dubstep & Bass", ("dubstep", "riddim", "brostep", "bass music", "future bass", "trap edm", "halftime")),
    ("UK Garage", ("garage", "ukg", "2-step", "2 step", "bassline", "grime", "speed garage")),
    ("Hardstyle & Hardcore", ("hardstyle", "hardcore", "gabber", "frenchcore", "rawstyle", "hard dance", "happy hardcore")),
    ("Techno", ("techno", "schranz", "acid", "minimal", "industrial")),
    ("Trance", ("trance", "psytrance", "goa", "psy")),
    ("Afro & Amapiano", ("amapiano", "afro house", "afrobeat", "afrobeats", "afro", "gqom")),
    ("House", ("house", "tech house", "deep house", "electro swing", "jackin", "funky", "bass house")),
    ("Disco & Funk", ("disco", "funk", "boogie", "nu-disco", "nu disco", "italo")),
    ("Hip-Hop", ("hip hop", "hip-hop", "hiphop", "rap", "trap", "drill", "boom bap", "phonk")),
    ("Latin", ("reggaeton", "latin", "dembow", "salsa", "bachata", "baile funk", "cumbia", "urbano")),
    ("Reggae & Dancehall", ("reggae", "dancehall", "dub", "ska")),
    ("R&B & Soul", ("r&b", "rnb", "soul", "neo soul", "motown")),
    ("Ambient & Downtempo", ("ambient", "downtempo", "chill", "lo-fi", "lofi", "trip hop", "chillout")),
    ("EDM", ("edm", "electro", "big room", "dance", "electronic", "electronica", "synthwave", "breakbeat", "breaks", "idm", "eurodance")),
    ("Rock", ("rock", "punk", "metal", "indie", "grunge", "alternative")),
    ("Pop", ("pop", "schlager", "singer-songwriter")),
]


_GENERIC = {"EDM": 0.3, "Pop": 0.5, "Rock": 0.6}


def genre_family(genres: list[str] | None) -> str:
    """Ordnet rohe Genre-Tags einer Familie zu.

    Frühere Tags zählen mehr (sie sind meist die wichtigeren), Sammelbegriffe wie
    „electronic“ weniger als konkrete Genres.
    """
    votes: dict[str, float] = {}
    for pos, g in enumerate(genres or []):
        text = f" {g.lower().strip()} "
        for family, words in FAMILIES:
            if any(re.search(rf"(?<![a-z]){re.escape(w)}(?![a-z])", text) for w in words):
                votes[family] = votes.get(family, 0) + _GENERIC.get(family, 1.0) / (1 + pos * 0.15)
                break
    return max(votes, key=votes.get) if votes else ""  # type: ignore[arg-type]


def mood_label(energy: float | None, valence: float | None) -> str:
    if energy is None:
        return ""
    v = 0.5 if valence is None else valence
    if energy >= 0.66:
        return "Euphorisch" if v >= 0.5 else "Treibend & dunkel"
    if energy >= 0.4:
        return "Groovig" if v >= 0.5 else "Deep & hypnotisch"
    return "Entspannt" if v >= 0.5 else "Melancholisch"


# Übliche Tempobereiche je Genre-Familie (BPM) – zum Erkennen unplausibler Schätzwerte.
TEMPO_RANGES = {
    "House": (112, 134), "Techno": (120, 152), "Trance": (126, 148), "Drum & Bass": (160, 182),
    "Dubstep & Bass": (135, 152), "UK Garage": (124, 142), "Hardstyle & Hardcore": (140, 200),
    "Disco & Funk": (100, 132), "Afro & Amapiano": (105, 128), "Hip-Hop": (70, 110),
}


def tempo_check(bpm: float | None, family: str | None) -> dict | None:
    """Passt das Tempo zum Genre? Liefert None (plausibel/unbekannt) oder einen Hinweis.

    Liegt das halbe oder doppelte Tempo im üblichen Bereich, wird es als Korrektur vorgeschlagen –
    Halb-/Doppeltempo ist der häufigste Fehler automatischer Tempoerkennung.
    """
    rng = TEMPO_RANGES.get(family or "")
    if not bpm or not rng or rng[0] <= bpm <= rng[1]:
        return None
    for factor in (2.0, 0.5):
        if rng[0] <= bpm * factor <= rng[1]:
            return {"suggest": round(bpm * factor, 2), "text": f"{bpm:g} BPM ist für {family} unüblich – vermutlich {bpm * factor:g} BPM ({'doppeltes' if factor == 2 else 'halbes'} Tempo)."}
    return {"suggest": None, "text": f"{bpm:g} BPM ist für {family} unüblich (meist {rng[0]}–{rng[1]}). Bitte prüfen."}
