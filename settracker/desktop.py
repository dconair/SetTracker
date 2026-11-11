"""Start als eigenständiges Programmfenster (pywebview).

Der Server läuft in einem Hintergrund-Thread, das Fenster zeigt die Oberfläche. Lässt sich das
Fenster nicht öffnen (Bibliothek fehlt, kein WebView2 unter Windows, kein Bildschirm), öffnet
sich die App stattdessen im Standardbrowser – wie beim Start über `settracker`.
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import traceback
import webbrowser

from . import cli, config

WINDOW_SIZE = (1320, 860)
MIN_SIZE = (960, 640)


def _log(message: str) -> None:
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}", flush=True)


def start_server(port: int) -> threading.Thread:
    import uvicorn

    from . import library
    from .app import app

    library.resume_pending()
    server = uvicorn.Server(uvicorn.Config(app, host=config.HOST, port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True, name="settracker-server")
    thread.start()
    return thread


def wait_for_server(url: str, timeout: float = 40) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if cli.already_running(url):
            return True
        time.sleep(0.2)
    return False


def _probe(window, result: dict) -> None:
    """Fenstertest: Hat die Oberfläche im Fenster wirklich geladen? Danach Fenster schließen."""
    try:
        window.events.loaded.wait(40)
        end = time.time() + 30
        while time.time() < end:
            count = window.evaluate_js("(document.getElementById('root') || {children: []}).children.length")
            if count:
                result["ok"] = True
                result["title"] = window.evaluate_js("document.title")
                break
            time.sleep(0.5)
    except Exception:
        result["error"] = traceback.format_exc()
    finally:
        window.destroy()


def open_window(url: str, test: dict | None = None) -> bool:
    """Öffnet das Programmfenster und blockiert, bis es geschlossen wird. False = nicht möglich."""
    try:
        import webview
    except Exception as exc:
        _log(f"Fenster-Bibliothek nicht verfügbar ({exc!r}) – Start im Browser.")
        return False
    try:
        webview.settings["ALLOW_DOWNLOADS"] = True              # Exporte speichern
        webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True  # Spickzettel, Spotify-Anmeldung
        config.DESKTOP = True
        window = webview.create_window("SetTracker", url, width=WINDOW_SIZE[0], height=WINDOW_SIZE[1], min_size=MIN_SIZE,
                                       background_color="#0a0c10", text_select=True)
        storage = config.data_dir() / "webview"
        if test is None:
            webview.start(private_mode=False, storage_path=str(storage))  # Darstellungs-Einstellungen bleiben erhalten
        else:
            webview.start(_probe, (window, test), private_mode=False, storage_path=str(storage))
        return True
    except Exception:
        config.DESKTOP = False
        _log("Fenster konnte nicht geöffnet werden – Start im Browser.\n" + traceback.format_exc())
        return False


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="SetTracker", description="DJ-Set-Planer")
    parser.add_argument("--port", type=int, default=config.PORT)
    parser.add_argument("--browser", action="store_true", help="im Standardbrowser statt im eigenen Fenster öffnen")
    parser.add_argument("--smoke-test", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--window-test", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.smoke_test:
        sys.exit(cli.smoke_test())

    url = f"http://{config.HOST}:{args.port}"
    if cli.already_running(url) and not args.window_test:
        # SetTracker läuft schon (anderes Fenster oder Browser-Modus): dorthin führen statt doppelt starten.
        webbrowser.open(url)
        return
    server = start_server(args.port)
    if not wait_for_server(url):
        _log("Der Server ist nicht gestartet – siehe Meldungen oben.")
        sys.exit(1)

    if args.window_test:
        threading.Timer(120, lambda: os._exit(3)).start()  # Notbremse, falls das Fenster hängt
        result: dict = {}
        opened = open_window(url, result)
        ok = opened and result.get("ok", False)
        _log(f"Fenstertest {'ok' if ok else 'FEHLGESCHLAGEN'}: geöffnet={opened}, Titel={result.get('title')!r} {result.get('error', '')}")
        os._exit(0 if ok else 1)

    if args.browser or not open_window(url):
        webbrowser.open(url)
        _log(f"SetTracker läuft im Browser auf {url} (Beenden über „Beenden“ in der App)")
        server.join()
    os._exit(0)  # Fenster geschlossen: Server-Thread und laufende Analysen beenden


if __name__ == "__main__":
    main()
