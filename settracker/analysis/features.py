"""Audio-Analyse einer Datei: BPM, Beatgrid, Tonart, Energie, Stimmung."""
from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np

from ..music import to_camelot

SR = 22050
HOP = 512
N_FFT = 2048

# Krumhansl-Kessler-Tonartprofile
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass
class Signal:
    """Geladenes Audio mit den Hüllkurven, die alle Analyseschritte teilen."""

    duration: float
    full: np.ndarray   # RMS-Hüllkurve je Frame
    low: np.ndarray    # < 200 Hz
    mid: np.ndarray    # 200–2500 Hz
    high: np.ndarray   # > 2500 Hz
    onset: np.ndarray
    chroma: np.ndarray
    bass_chroma: np.ndarray
    rms_db: float
    centroid: float

    def frame(self, t: float) -> int:
        return int(np.clip(round(t * SR / HOP), 0, len(self.full) - 1))


def load(path: str) -> Signal:
    import librosa

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        y, _ = librosa.load(path, sr=SR, mono=True)
    if len(y) < SR * 5:
        raise ValueError("Datei ist kürzer als 5 Sekunden")
    spec = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    band = lambda lo, hi: np.sqrt(spec[(freqs >= lo) & (freqs < hi)].sum(axis=0))  # noqa: E731
    total = spec.sum(axis=0)
    centroid = float((freqs[:, None] * spec).sum() / max(total.sum(), 1e-12))
    return Signal(
        duration=len(y) / SR,
        full=np.sqrt(total),
        low=band(0, 200),
        mid=band(200, 2500),
        high=band(2500, SR),
        onset=librosa.onset.onset_strength(S=librosa.power_to_db(spec, ref=np.max), sr=SR, hop_length=HOP),
        chroma=librosa.feature.chroma_stft(S=spec, sr=SR, n_fft=N_FFT, hop_length=HOP),
        bass_chroma=librosa.feature.chroma_stft(S=spec * (freqs < 260)[:, None], sr=SR, n_fft=N_FFT, hop_length=HOP, norm=None).sum(axis=1),
        rms_db=float(20 * np.log10(max(np.sqrt(np.mean(y**2)), 1e-6))),
        centroid=centroid,
    )


def _comb_score(pulse: np.ndarray, bpm: float, duration: float) -> tuple[float, float]:
    """Wie gut passt ein Raster mit diesem Tempo? Liefert (Score, Phase in Sekunden)."""
    period = 60.0 / bpm * SR / HOP  # in Frames
    n = int((len(pulse) - 1) / period) - 1
    if n < 8:
        return 0.0, 0.0
    steps = np.arange(n) * period
    offsets = np.arange(0, period, 0.5)
    idx = np.rint(offsets[:, None] + steps[None, :]).astype(int)
    scores = pulse[np.clip(idx, 0, len(pulse) - 1)].mean(axis=1)
    best = int(np.argmax(scores))
    return float(scores[best]), float(offsets[best] * HOP / SR)


def beatgrid(sig: Signal) -> dict:
    """Festes Raster: BPM, erster Schlag und erste Eins (Downbeat)."""
    import librosa

    tempo, _ = librosa.beat.beat_track(onset_envelope=sig.onset, sr=SR, hop_length=HOP)
    rough = float(np.atleast_1d(tempo)[0]) or 120.0
    while rough < 75:
        rough *= 2
    while rough > 185:
        rough /= 2

    # Feinsuche: Raster an den Bass-Einsätzen (Kick) ausrichten, sonst an allen Onsets.
    low_rise = np.maximum(np.diff(sig.low, prepend=sig.low[0]), 0)
    pulse = low_rise if low_rise.max() > 0 and sig.low.mean() > 0.05 * sig.full.mean() else sig.onset
    pulse = np.convolve(pulse, [0.25, 0.5, 0.25], mode="same")
    lo, hi = rough * 0.96, rough * 1.04
    candidates = np.unique(np.round(np.concatenate([np.arange(lo, hi, 0.05), np.arange(np.ceil(lo), hi, 1.0)]), 2))
    scored = [(*_comb_score(pulse, c, sig.duration), c) for c in candidates]
    best_score = max(s[0] for s in scored)
    # Ganzzahlige Tempi bevorzugen, wenn sie praktisch gleich gut passen
    whole = [s for s in scored if abs(s[2] - round(s[2])) < 0.01 and s[0] >= 0.97 * best_score]
    score, first, bpm = max(whole or scored, key=lambda s: s[0])
    period = 60.0 / bpm
    first = first % period
    if first > period - 0.03:  # Raster beginnt praktisch bei 0
        first = 0.0

    n_beats = int((sig.duration - first) / period)
    # Die Eins trägt bei tanzbarer Musik die meiste Bass- und Onset-Energie.
    strength = np.zeros(4)
    for i in range(n_beats):
        f = sig.frame(first + i * period)
        strength[i % 4] += sig.low[f : f + 4].mean()
    phase = int(np.argmax(strength)) if strength.max() > strength.mean() * 1.08 else 0
    return {"bpm": round(float(bpm), 2), "first_beat": round(first, 4), "first_downbeat": round(first + phase * period, 4)}


def detect_key(sig: Signal) -> str:
    profile = sig.chroma.mean(axis=1)
    scores = {}
    for pc in range(12):
        for major, ref in ((True, _MAJOR), (False, _MINOR)):
            scores[(pc, major)] = float(np.corrcoef(profile, np.roll(ref, pc))[0, 1])
    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    # Dur/Moll-Parallelen sind per Profil kaum zu trennen: der Basston entscheidet.
    pc, major = best
    relative = ((pc + 9) % 12, False) if major else ((pc + 3) % 12, True)
    if scores[best] - scores[relative] < 0.12 and sig.bass_chroma[relative[0]] > 1.5 * sig.bass_chroma[pc]:
        best = relative
    return to_camelot(*best)


def mood(sig: Signal, bpm: float, camelot: str) -> dict:
    """Heuristische Energie (0–1) und Stimmung/Valenz (0–1) – Schätzwerte."""
    loud = np.clip((sig.rms_db + 30) / 22, 0, 1)
    bright = np.clip(sig.centroid / 3500, 0, 1)
    pulse = np.clip(sig.onset.mean() / 2.5, 0, 1)
    energy = float(np.clip(0.5 * loud + 0.25 * bright + 0.25 * pulse, 0, 1))
    major = camelot.endswith("B")
    valence = float(np.clip(0.5 + (0.14 if major else -0.14) + 0.3 * (bright - 0.5) + (bpm - 120) / 400, 0, 1))
    return {"energy": round(energy, 3), "valence": round(valence, 3), "loudness": round(sig.rms_db, 2)}
