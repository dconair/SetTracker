"""Startbefehl: `settracker` startet den lokalen Server und öffnet die App im Browser."""
from __future__ import annotations

import argparse
import sys
import threading
import webbrowser

from . import config


def already_running(url: str) -> bool:
    """Läuft unter dieser Adresse schon ein SetTracker? Dann nur den Browser öffnen."""
    import httpx

    try:
        return "analysis" in httpx.get(f"{url}/api/status", timeout=1.5).json()
    except Exception:
        return False


def smoke_test() -> int:
    """Selbsttest für gebaute Installer: erzeugt einen Demo-Track und analysiert ihn."""
    import tempfile
    from pathlib import Path

    import soundfile as sf

    from . import demo
    from .analysis import analyze_file

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "smoke.wav"
        sf.write(path, demo.synth(124, 9, False, (8, 16, 4, 8, 8)), demo.SR)
        fields = analyze_file(str(path))["fields"]
    ok = abs(fields["bpm"] - 124) <= 1 and (config.STATIC_DIR / "index.html").is_file()
    print(f"Selbsttest {'ok' if ok else 'FEHLGESCHLAGEN'}: {fields['bpm']} BPM, {fields['camelot']}, Oberfläche vorhanden: {(config.STATIC_DIR / 'index.html').is_file()}")
    return 0 if ok else 1


def main() -> None:
    parser = argparse.ArgumentParser(prog="settracker", description="DJ-Set-Planer starten")
    parser.add_argument("--port", type=int, default=config.PORT)
    parser.add_argument("--no-browser", action="store_true", help="Browser nicht automatisch öffnen")
    parser.add_argument("--smoke-test", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.smoke_test:
        sys.exit(smoke_test())

    url = f"http://{config.HOST}:{args.port}"
    if already_running(url):
        if not args.no_browser:
            webbrowser.open(url)
        print(f"SetTracker läuft bereits auf {url}")
        return

    import uvicorn

    from . import library
    from .app import app

    library.resume_pending()
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"SetTracker läuft auf {url}  (Beenden mit Strg+C oder über „Beenden“ in der App)")
    uvicorn.run(app, host=config.HOST, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
