"""Startbefehl: `settracker` öffnet die App im Browser."""
from __future__ import annotations

import argparse
import threading
import webbrowser

from . import config


def main() -> None:
    parser = argparse.ArgumentParser(prog="settracker", description="DJ-Set-Planer starten")
    parser.add_argument("--port", type=int, default=config.PORT)
    parser.add_argument("--no-browser", action="store_true", help="Browser nicht automatisch öffnen")
    args = parser.parse_args()

    import uvicorn

    url = f"http://{config.HOST}:{args.port}"
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"SetTracker läuft auf {url}  (Beenden mit Strg+C)")
    uvicorn.run("settracker.app:app", host=config.HOST, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
