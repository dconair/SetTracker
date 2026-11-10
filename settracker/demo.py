"""Erzeugt synthetische Demo-Tracks mit bekanntem Tempo, Tonart und Aufbau.

Dient als Testmaterial (pytest, Ausprobieren der App ohne eigene Musik).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

SR = 22050

# (Name, Künstler, Genre, BPM, Grundton 0=C, Dur?, Aufbau in Takten: Intro/Haupt/Break/Haupt/Outro, Pegel)
DEMO_TRACKS = [
    ("Morning Light", "Demo Deep", "Deep House", 120, 9, False, (8, 16, 8, 16, 8), 0.55),
    ("Rooftop Groove", "Demo Deep", "Deep House", 122, 4, False, (8, 16, 8, 16, 8), 0.65),
    ("Warehouse Jack", "Demo Tech", "Tech House", 125, 11, False, (16, 16, 4, 16, 16), 0.8),
    ("Peak Pressure", "Demo Tech", "Tech House", 126, 6, False, (8, 24, 4, 16, 8), 0.9),
    ("Sunset Piano", "Demo Deep", "House", 124, 0, True, (8, 16, 8, 16, 8), 0.7),
    ("Steel Tunnel", "Demo Tek", "Techno", 132, 2, False, (16, 24, 4, 16, 16), 0.95),
    ("Liquid Sky", "Demo Roller", "Liquid Drum and Bass", 174, 5, False, (16, 32, 8, 32, 16), 0.85),
    ("Night Bus", "Demo Roller", "Drum and Bass", 172, 7, False, (16, 32, 8, 32, 16), 0.9),
]


def _kick(n: int) -> np.ndarray:
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (45 * t + 60 * (1 - np.exp(-t * 35)) / 35)) * np.exp(-t * 9)


def synth(bpm: float, root: int, major: bool, layout: tuple[int, ...], level: float = 0.8, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    kinds = ["intro", "main", "break", "main", "outro"]
    total_bars = sum(layout)
    out = np.zeros(int(total_bars * 4 * beat * SR) + SR)
    kick = _kick(int(0.3 * SR))
    hat = rng.standard_normal(int(0.04 * SR)) * np.exp(-np.arange(int(0.04 * SR)) / (0.008 * SR))
    f0 = 55.0 * 2 ** (((root - 9) % 12) / 12)  # Bass in der A1-Oktave
    third = 4 if major else 3
    bar = 0
    for kind, length in zip(kinds, layout):
        for _ in range(length):
            for b in range(4):
                pos = int((bar * 4 + b) * beat * SR)
                n = int(beat * SR)
                t = np.arange(n) / SR
                if kind != "break":
                    amp = 1.0 if kind == "main" else 0.45
                    out[pos : pos + len(kick)] += amp * kick
                    off = pos + n // 2
                    out[off : off + len(hat)] += 0.25 * amp * hat
                if kind == "main":
                    env = np.minimum(1, t * 40) * np.exp(-t * 3)
                    bass = np.sign(np.sin(2 * np.pi * f0 * t)) * 0.3 + np.sin(2 * np.pi * f0 * t) * 0.5
                    out[pos : pos + n] += 0.6 * bass * env
                if kind in ("main", "break"):
                    amp = 0.22 if kind == "main" else 0.3
                    chord = sum(np.sin(2 * np.pi * f0 * 4 * 2 ** (s / 12) * t) for s in (0, third, 7))
                    out[pos : pos + n] += amp * chord * np.minimum(1, t * 20) * np.minimum(1, (n / SR - t) * 20)
            bar += 1
    out = out[: int(total_bars * 4 * beat * SR)]
    return (out / np.abs(out).max() * level).astype(np.float32)


def write_demo_library(folder: str | Path) -> list[Path]:
    import soundfile as sf

    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, (title, artist, _genre, bpm, root, major, layout, level) in enumerate(DEMO_TRACKS):
        path = folder / f"{artist} - {title}.wav"
        if not path.exists():
            sf.write(path, synth(bpm, root, major, layout, level, seed=i), SR)
        paths.append(path)
    return paths


def demo_genre(path: Path) -> str:
    for title, artist, genre, *_ in DEMO_TRACKS:
        if path.stem == f"{artist} - {title}":
            return genre
    return ""
