"""Pfade und Einstellungen."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

DATA_DIR = Path(os.environ.get("SETTRACKER_DATA", Path.home() / ".settracker"))
ENV_FILE = DATA_DIR / ".env"

# Zugangsdaten: zuerst die .env im Arbeitsordner (Entwicklung), dann die im Datenordner
# (dort speichert die Oberfläche sie; die installierte App hat keinen Arbeitsordner).
load_dotenv()
load_dotenv(ENV_FILE)
STATIC_DIR = Path(__file__).parent / "static"
HOST = os.environ.get("SETTRACKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("SETTRACKER_PORT", "8000"))
REDIRECT_URI = os.environ.get("SPOTIPY_REDIRECT_URI", f"http://127.0.0.1:{PORT}/callback")

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".aiff", ".aif"}


def data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR
