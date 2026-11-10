"""Pfade und Einstellungen."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(os.environ.get("SETTRACKER_DATA", Path.home() / ".settracker"))
STATIC_DIR = Path(__file__).parent / "static"
HOST = os.environ.get("SETTRACKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("SETTRACKER_PORT", "8000"))
REDIRECT_URI = os.environ.get("SPOTIPY_REDIRECT_URI", f"http://127.0.0.1:{PORT}/callback")

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".aiff", ".aif"}


def data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR
