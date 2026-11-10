"""Spotify Web API: Login (Authorization Code), Bibliothek lesen, Playlist anlegen.

Nutzt spotipy nur für die Token-Verwaltung; die Aufrufe selbst gehen direkt an die
aktuellen Endpunkte (Stand 2026: /playlists/{id}/items, POST /me/playlists, keine
Sammelabrufe mehr), mit Rückfall auf die älteren Pfade.
"""
from __future__ import annotations

import os
import time

import httpx

from .. import config

API = "https://api.spotify.com/v1"
SCOPES = "playlist-read-private playlist-read-collaborative user-library-read playlist-modify-private playlist-modify-public"


class SpotifyError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def configured() -> bool:
    return bool(os.environ.get("SPOTIPY_CLIENT_ID") and os.environ.get("SPOTIPY_CLIENT_SECRET"))


def oauth():
    from spotipy.cache_handler import CacheFileHandler
    from spotipy.oauth2 import SpotifyOAuth

    return SpotifyOAuth(
        redirect_uri=config.REDIRECT_URI, scope=SCOPES, open_browser=False,
        cache_handler=CacheFileHandler(cache_path=str(config.data_dir() / "spotify_token.json")),
    )


def login_url() -> str:
    return oauth().get_authorize_url()


def finish_login(code: str) -> None:
    oauth().get_access_token(code, as_dict=False, check_cache=False)


def logout() -> None:
    (config.data_dir() / "spotify_token.json").unlink(missing_ok=True)


def user_token() -> str | None:
    if not configured():
        return None
    auth = oauth()
    token = auth.validate_token(auth.cache_handler.get_cached_token())
    return token["access_token"] if token else None


def app_token() -> str:
    from spotipy.cache_handler import MemoryCacheHandler
    from spotipy.oauth2 import SpotifyClientCredentials

    global _app_auth
    if _app_auth is None:
        _app_auth = SpotifyClientCredentials(cache_handler=MemoryCacheHandler())
    return _app_auth.get_access_token(as_dict=False)


_app_auth = None


def request(method: str, path: str, user: bool = True, **kwargs):
    """API-Aufruf mit Wartezeit bei Rate-Limit. `user=False` nutzt den App-Token (Suche)."""
    token = user_token() if user else app_token()
    if not token:
        raise SpotifyError(401, "Nicht bei Spotify angemeldet")
    url = path if path.startswith("http") else API + path
    for attempt in range(4):
        r = httpx.request(method, url, headers={"Authorization": f"Bearer {token}"}, timeout=30, **kwargs)
        if r.status_code == 429 and attempt < 3:
            time.sleep(min(float(r.headers.get("Retry-After", "2")), 20) + 0.5)
            continue
        break
    if r.status_code >= 400:
        try:
            message = r.json()["error"]["message"]
        except Exception:
            message = r.text[:200]
        raise SpotifyError(r.status_code, f"Spotify {r.status_code}: {message}")
    return r.json() if r.content else {}


def _first_ok(method: str, paths: list[str], **kwargs):
    """Probiert neue und alte Endpunktnamen nacheinander."""
    last: SpotifyError | None = None
    for path in paths:
        try:
            return request(method, path, **kwargs)
        except SpotifyError as exc:
            if exc.status not in (403, 404, 405):
                raise
            last = exc
    raise last  # type: ignore[misc]


def _pages(first: dict):
    page = first
    while True:
        yield from page.get("items") or []
        if not page.get("next"):
            return
        page = request("GET", page["next"])


def normalize(obj: dict | None) -> dict | None:
    """Spotify-Trackobjekt → flache Felder; Episoden und lokale Dateien werden ausgelassen."""
    if not obj or obj.get("type", "track") != "track" or not obj.get("id") or obj.get("is_local"):
        return None
    return {
        "spotify_id": obj["id"],
        "title": obj.get("name") or "",
        "artist": ", ".join(a["name"] for a in obj.get("artists") or [] if a.get("name")),
        "album": (obj.get("album") or {}).get("name") or "",
        "duration": (obj.get("duration_ms") or 0) / 1000,
        "isrc": (obj.get("external_ids") or {}).get("isrc"),
    }


def me() -> dict:
    return request("GET", "/me")


def playlists() -> list[dict]:
    out = []
    for p in _pages(request("GET", "/me/playlists", params={"limit": 50})):
        if p:
            count = (p.get("items") or p.get("tracks") or {}).get("total")
            out.append({"id": p["id"], "name": p.get("name") or "", "count": count,
                        "image": (p.get("images") or [{}])[0].get("url"), "owner": (p.get("owner") or {}).get("display_name")})
    return out


def playlist_tracks(playlist_id: str) -> tuple[str, list[dict]]:
    meta = request("GET", f"/playlists/{playlist_id}", params={"fields": "name"})
    first = _first_ok("GET", [f"/playlists/{playlist_id}/items", f"/playlists/{playlist_id}/tracks"], params={"limit": 50})
    tracks = [t for it in _pages(first) if (t := normalize(it.get("item") or it.get("track")))]
    return meta.get("name") or "Playlist", tracks


def liked_tracks() -> list[dict]:
    first = request("GET", "/me/tracks", params={"limit": 50})
    return [t for it in _pages(first) if (t := normalize(it.get("track") or it.get("item")))]


def search_track(title: str, artist: str = "", isrc: str | None = None, duration: float = 0) -> dict | None:
    """Besten Spotify-Treffer für einen lokalen Track finden (ISRC, sonst Titel + Künstler)."""
    queries = [f"isrc:{isrc}"] if isrc else []
    main_artist = artist.split(",")[0].split(" feat")[0].strip()
    queries.append(f'track:"{title}"' + (f' artist:"{main_artist}"' if main_artist else ""))
    queries.append(f"{title} {main_artist}".strip())
    for q in queries:
        try:
            items = request("GET", "/search", user=False, params={"q": q, "type": "track", "limit": 5})["tracks"]["items"]
        except SpotifyError:
            continue
        found = [t for it in items if (t := normalize(it))]
        if duration:
            found = [t for t in found if abs(t["duration"] - duration) < 12] or found[:1]
        if found:
            return found[0]
    return None


def create_playlist(name: str, track_ids: list[str], description: str = "") -> dict:
    body = {"name": name, "description": description, "public": False}
    try:
        pl = request("POST", "/me/playlists", json=body)
    except SpotifyError as exc:
        if exc.status not in (403, 404, 405):
            raise
        pl = request("POST", f"/users/{me()['id']}/playlists", json=body)
    uris = [f"spotify:track:{i}" for i in track_ids]
    for start in range(0, len(uris), 100):
        chunk = {"uris": uris[start : start + 100]}
        _first_ok("POST", [f"/playlists/{pl['id']}/items", f"/playlists/{pl['id']}/tracks"], json=chunk)
    return {"id": pl["id"], "url": (pl.get("external_urls") or {}).get("spotify") or f"https://open.spotify.com/playlist/{pl['id']}"}
