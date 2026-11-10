"""Einstiegspunkt der installierten App (PyInstaller)."""
import os
import sys
from pathlib import Path

data = Path(os.environ.get("SETTRACKER_DATA", Path.home() / ".settracker"))
data.mkdir(parents=True, exist_ok=True)
# librosa/numba legen übersetzte Funktionen ab; im App-Bundle selbst darf nicht geschrieben werden.
os.environ.setdefault("NUMBA_CACHE_DIR", str(data / "numba-cache"))

# Ohne Konsolenfenster gibt es keine Standardausgabe – Meldungen landen in einer Logdatei.
if sys.stdout is None or sys.stderr is None:
    log = open(data / "settracker.log", "a", buffering=1, encoding="utf-8")
    sys.stdout = sys.stderr = log

from settracker.cli import main  # noqa: E402

if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()
    main()
