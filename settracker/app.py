"""FastAPI-Anwendung: REST-API und Auslieferung der Oberfläche."""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db, library
from .engine import compat, cues as cue_engine, review as review_engine, tutorial, sequence, suggest as suggest_engine, transitions
from .export import cheatsheet, m3u, rekordbox_xml
from .music import FAMILIES, genre_family, key_name, mood_label, tempo_check
from .spotify import client as spotify, importer, reccobeats

app = FastAPI(title="SetTracker")


def weights() -> dict:
    return {**compat.DEFAULT_WEIGHTS, **(db.kv_get("weights") or {})}


def present(track: dict) -> dict:
    """Track für die Oberfläche: ohne große Analysefelder, mit abgeleiteten Angaben."""
    t = dict(track)
    an = t.pop("analysis", None)
    t["has_analysis"] = bool(an) if "has_analysis" not in t else t["has_analysis"]
    t["key_name"] = key_name(t.get("camelot"))
    t["mood"] = mood_label(t.get("energy"), t.get("valence"))
    hint = tempo_check(t.get("bpm"), t.get("family")) if t.get("data_source") != "von Hand korrigiert" else None
    t["bpm_hint"] = hint
    t["estimated"] = (t.get("data_source") or "").startswith("Vorhörclip")
    t["incomplete"] = importer.incomplete(track) if "status" in track and "genres" in track else False
    if an:
        t["intro_bars"], t["outro_bars"] = compat.section_bars(track, "intro"), compat.section_bars(track, "outro")
    return t


def need_track(track_id: int) -> dict:
    t = db.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track nicht gefunden")
    return t


def need_set(set_id: int) -> dict:
    s = db.get_set(set_id)
    if not s:
        raise HTTPException(404, "Set nicht gefunden")
    return s


def set_tracks(s: dict) -> list[dict]:
    return db.get_tracks([i["track_id"] for i in s["items"]])


def set_view(s: dict) -> dict:
    tracks = set_tracks(s)
    pinned = {i["track_id"] for i in s["items"] if i.get("pinned")}
    rating = review_engine.rate(tracks, weights())
    return {
        "id": s["id"], "name": s["name"], "curve": s["curve"], "origin": s["origin"], "overrides": s["overrides"],
        "spotify_playlist_id": s.get("spotify_playlist_id"),
        "files": {"local": sum(1 for t in tracks if t["path"]), "analyzed": sum(1 for t in tracks if t["path"] and t["status"] == "done"), "total": len(tracks)},
        "items": [{"track": present(t), "pinned": t["id"] in pinned} for t in tracks],
        "rating": rating,
        "duration": sum(t["duration"] or 0 for t in tracks),
        "targets": [sequence.curve_target(i / max(len(tracks) - 1, 1), s["curve"]) for i in range(len(tracks))],
    }


# ------------------------------------------------------------------ Status
@app.get("/api/status")
def status() -> dict:
    user = None
    if spotify.configured():
        try:
            if spotify.user_token():
                user = db.kv_get("spotify_user")
                if not user:
                    me = spotify.me()
                    user = {"name": me.get("display_name") or me.get("id"), "id": me.get("id")}
                    db.kv_set("spotify_user", user)
        except Exception:
            user = None
    return {
        "analysis": library.status(),
        "spotify": {"configured": spotify.configured(), "user": user, "job": importer.status(), "redirect_uri": config.REDIRECT_URI},
        "desktop": config.DESKTOP,
        "families": [f for f, _ in FAMILIES],
        "curves": sequence.CURVES,
        "templates": transitions.TEMPLATES,
        "weights": weights(),
    }


class Weights(BaseModel):
    weights: dict[str, float]


@app.put("/api/settings")
def save_settings(body: Weights) -> dict:
    clean = {k: max(0.0, min(1.0, float(v))) for k, v in body.weights.items() if k in compat.DEFAULT_WEIGHTS}
    db.kv_set("weights", clean)
    return {"weights": weights()}


# ------------------------------------------------------------------ Bibliothek
@app.get("/api/tracks")
def tracks() -> list[dict]:
    return [present(t) for t in db.all_tracks(light=False)]


@app.get("/api/tracks/{track_id}")
def track(track_id: int) -> dict:
    t = need_track(track_id)
    return {**present(t), "analysis": t["analysis"], "cues": cue_engine.track_cues(t), "phases": cue_engine.phases(t)}


@app.get("/api/tracks/{track_id}/waveform")
def waveform(track_id: int) -> dict:
    t = need_track(track_id)
    wf = db.get_waveform(track_id)
    if not wf:
        raise HTTPException(404, "Keine Waveform vorhanden")
    an = t["analysis"] or {}
    return {**wf, "sections": an.get("sections", []), "first_downbeat": an.get("first_downbeat"), "bar_len": an.get("bar_len")}


@app.get("/api/tracks/{track_id}/audio")
def audio(track_id: int):
    t = need_track(track_id)
    if not t["path"] or not Path(t["path"]).is_file():
        raise HTTPException(404, "Keine Audiodatei vorhanden")
    return FileResponse(t["path"])


class TrackPatch(BaseModel):
    family: str | None = None
    genres: list[str] | None = None
    bpm: float | None = None
    camelot: str | None = None


@app.patch("/api/tracks/{track_id}")
def patch_track(track_id: int, body: TrackPatch) -> dict:
    t = need_track(track_id)
    fields = body.model_dump(exclude_none=True)
    if "genres" in fields and "family" not in fields:
        fields["family"] = genre_family(fields["genres"])
    if "family" in fields and "genres" not in fields and not t["genres"]:
        fields["genres"] = [fields["family"]] if fields["family"] else []
    if "camelot" in fields:
        from .music import parse_camelot

        parsed = parse_camelot(fields["camelot"])
        if not parsed:
            raise HTTPException(400, "Tonart bitte als Camelot-Code angeben, z. B. 8A oder 11B")
        fields["camelot"] = f"{parsed[0]}{parsed[1]}"
    if "bpm" in fields and not 40 <= fields["bpm"] <= 260:
        raise HTTPException(400, "BPM muss zwischen 40 und 260 liegen")
    if {"bpm", "camelot"} & set(fields):
        fields["data_source"] = "von Hand korrigiert"
        if t["status"] in ("pending", "error") and (fields.get("bpm") or t.get("bpm")):
            fields.update(status="partial", error=None)
    db.update_track(track_id, **fields)
    return present(need_track(track_id))


class GridShift(BaseModel):
    beats: int


@app.post("/api/tracks/{track_id}/grid-shift")
def grid_shift(track_id: int, body: GridShift) -> dict:
    """Die erkannte Eins um ganze Schläge verschieben, wenn das Raster daneben liegt."""
    t = need_track(track_id)
    an = t["analysis"]
    if not an or body.beats not in (-1, 1):
        raise HTTPException(400, "Nur für analysierte Dateien, um genau einen Schlag vor oder zurück")
    beat = an["bar_len"] / 4
    delta = body.beats * beat
    first = an["first_downbeat"] + delta
    if first < 0:
        first += an["bar_len"]          # nie vor den Trackanfang: stattdessen einen Takt später
        delta += an["bar_len"]
    an["first_downbeat"] = round(first, 4)
    for sec in an["sections"]:
        sec["start"], sec["end"] = round(sec["start"] + delta, 3), round(sec["end"] + delta, 3)
    db.update_track(track_id, analysis=an)
    return {**present(need_track(track_id)), "analysis": an}


class Link(BaseModel):
    other_id: int


@app.get("/api/tracks/{track_id}/link-candidates")
def link_candidates(track_id: int) -> list[dict]:
    """Lokale Tracks ohne Spotify-Bezug, nach Ähnlichkeit zum Spotify-Eintrag sortiert."""
    from .spotify.match import similarity

    target = need_track(track_id)
    pool = [t for t in db.all_tracks() if t["source"] == "local" and not t["spotify_id"]]
    pool.sort(key=lambda t: -similarity(target, t))
    return [present(t) for t in pool[:25]]


@app.post("/api/tracks/{track_id}/link")
def link_track(track_id: int, body: Link) -> dict:
    need_track(track_id)
    try:
        library.merge(track_id, body.other_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return present(need_track(track_id))


@app.post("/api/tracks/{track_id}/unlink")
def unlink_track(track_id: int) -> dict:
    need_track(track_id)
    try:
        new_id = library.unlink(track_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    importer.enrich_features([track_id])
    return {"spotify": present(need_track(track_id)), "file_id": new_id}


class Bulk(BaseModel):
    ids: list[int]
    family: str | None = None
    delete: bool = False


@app.post("/api/tracks/bulk")
def bulk(body: Bulk) -> dict:
    for i in body.ids:
        if body.delete:
            db.delete_track(i)
        elif body.family is not None:
            db.update_track(i, family=body.family, genres=[body.family] if body.family else [])
    return {"ok": True}


class Scan(BaseModel):
    path: str


@app.post("/api/library/scan")
def scan(body: Scan) -> dict:
    try:
        return library.scan_folder(body.path)
    except FileNotFoundError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/library/demo")
def demo() -> dict:
    from .demo import write_demo_library

    folder = config.data_dir() / "Demo-Tracks"
    write_demo_library(folder)
    return library.scan_folder(str(folder))


class Enrich(BaseModel):
    ids: list[int] | None = None


@app.post("/api/library/enrich")
def enrich_library(body: Enrich) -> dict:
    """Fehlende Daten (BPM, Tonart, Stimmung, Genre) nachschlagen – läuft im Hintergrund."""
    pool = db.get_tracks(body.ids) if body.ids else db.all_tracks(light=False)
    ids = [t["id"] for t in pool if importer.incomplete(t)]
    if importer.status()["running"]:
        raise HTTPException(409, "Es läuft bereits ein Nachschlage-Auftrag – bitte kurz warten")
    if ids:
        importer.run_enrich(ids)
    return {"queued": len(ids)}


@app.post("/api/tracks/{track_id}/enrich")
def enrich_track(track_id: int) -> dict:
    """Einen Track sofort erneut nachschlagen (alle Quellen, leere Cache-Einträge werden übergangen)."""
    need_track(track_id)
    importer.enrich_features([track_id])
    found = importer.enrich_one(track_id, force=True)
    t = need_track(track_id)
    return {"track": present(t), "found": found, "complete": not importer.incomplete(t)}


@app.get("/api/fs")
def browse(path: str = "") -> dict:
    """Ordner-Auswahl: Unterordner eines Pfads auf diesem Rechner."""
    base = Path(path).expanduser() if path else Path.home()
    if not base.is_dir():
        raise HTTPException(400, "Ordner nicht gefunden")
    dirs, audio = [], 0
    try:
        for p in sorted(base.iterdir(), key=lambda p: p.name.lower()):
            if p.name.startswith("."):
                continue
            if p.is_dir():
                dirs.append(p.name)
            elif p.suffix.lower() in config.AUDIO_EXTENSIONS:
                audio += 1
    except PermissionError:
        pass
    return {"path": str(base), "parent": str(base.parent) if base.parent != base else None, "dirs": dirs, "audio_files": audio}


# ------------------------------------------------------------------ Spotify
def spotify_call(fn, *args):
    try:
        return fn(*args)
    except spotify.SpotifyError as exc:
        raise HTTPException(401 if exc.status == 401 else 502, str(exc))


@app.get("/api/spotify/login")
def spotify_login() -> dict:
    if not spotify.configured():
        raise HTTPException(400, "SPOTIPY_CLIENT_ID und SPOTIPY_CLIENT_SECRET fehlen (.env)")
    return {"url": spotify.login_url()}


class Credentials(BaseModel):
    client_id: str
    client_secret: str


@app.post("/api/spotify/credentials")
def spotify_credentials(body: Credentials) -> dict:
    cid, secret = body.client_id.strip(), body.client_secret.strip()
    if not re.fullmatch(r"[0-9a-zA-Z]{20,64}", cid) or not re.fullmatch(r"[0-9a-zA-Z]{20,64}", secret):
        raise HTTPException(400, "Client ID und Client Secret bestehen aus je 32 Buchstaben und Ziffern")
    try:
        spotify.save_credentials(cid, secret)
    except spotify.SpotifyError as exc:
        raise HTTPException(400, str(exc))
    db.kv_set("spotify_user", None)
    return {"ok": True}


def _login_page(title: str, text: str) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'><title>SetTracker – Spotify</title>"
        "<body style='font:15px/1.5 system-ui,sans-serif;background:#0a0c10;color:#e9ecf2;max-width:560px;margin:12vh auto;padding:0 24px'>"
        f"<h1 style='font-size:20px'>{title}</h1><p style='color:#8d95a8'>{text}</p>"
        "<p><a href='/#/bibliothek' style='color:#6c8cff'>Zurück zu SetTracker</a></p></body>", status_code=400)


@app.get("/callback")
def spotify_callback(code: str | None = None, error: str | None = None):
    if not code and not error:
        # Direkt aufgerufen, nicht von Spotify zurückgeleitet
        return _login_page(
            "Diese Seite ist nur das Rücksprungziel",
            "Hierher leitet Spotify nach der Anmeldung automatisch zurück – die Adresse selbst zu öffnen bewirkt nichts. "
            "Starte die Anmeldung in SetTracker über „Spotify importieren“ → „Mit Spotify anmelden“.")
    if error:
        reason = "Du hast die Freigabe abgelehnt." if error == "access_denied" else f"Spotify meldet: {error}."
        return _login_page("Spotify-Anmeldung nicht abgeschlossen", reason)
    try:
        spotify.finish_login(code)
    except Exception as exc:
        return _login_page(
            "Spotify-Anmeldung fehlgeschlagen",
            f"Der Anmeldecode konnte nicht eingelöst werden ({str(exc)[:200]}). Häufigste Ursache: Client Secret falsch oder die "
            f"Redirect URI in der Spotify-App weicht von <code>{config.REDIRECT_URI}</code> ab.")
    db.kv_set("spotify_user", None)
    if config.DESKTOP:
        # Die Anmeldung lief im Standardbrowser; die App selbst ist das Programmfenster.
        return HTMLResponse(
            "<!doctype html><meta charset='utf-8'><title>SetTracker – Spotify</title>"
            "<body style='font:15px/1.5 system-ui,sans-serif;background:#0a0c10;color:#e9ecf2;max-width:560px;margin:12vh auto;padding:0 24px'>"
            "<h1 style='font-size:20px'>Anmeldung erfolgreich</h1>"
            "<p style='color:#8d95a8'>Du kannst diesen Tab schließen und zu SetTracker zurückkehren.</p></body>")
    return RedirectResponse("/#/bibliothek")


@app.get("/api/spotify/check")
def spotify_check() -> dict:
    """Verbindungsprüfung Schritt für Schritt – zeigt, an welcher Stelle Spotify nicht mitspielt."""
    steps: list[dict] = []

    def step(name: str, fn, hint: str) -> bool:
        try:
            detail = fn()
            steps.append({"name": name, "ok": True, "detail": detail or ""})
            return True
        except Exception as exc:
            status = getattr(exc, "status", None)
            extra = hint
            if status == 403:
                extra = ("Spotify verweigert den Zugriff (403). Im Developer Dashboard unter „User Management“ muss dein "
                         "Spotify-Konto eingetragen sein, und der Besitzer der App braucht Spotify Premium.")
            elif status == 401:
                extra = "Die Anmeldung ist abgelaufen oder ungültig – bitte abmelden und neu anmelden."
            steps.append({"name": name, "ok": False, "detail": str(exc)[:200], "hint": extra})
            return False

    if not spotify.configured():
        steps.append({"name": "Zugangsdaten hinterlegt", "ok": False, "detail": "", "hint": "Client ID und Client Secret fehlen auf diesem Rechner – bitte im Dialog eintragen."})
        return {"ok": False, "steps": steps, "redirect_uri": config.REDIRECT_URI}
    steps.append({"name": "Zugangsdaten hinterlegt", "ok": True, "detail": ""})
    ok = step("Client ID und Secret gültig", lambda: spotify.app_token() and "",
              "Spotify lehnt Client ID/Secret ab – bitte im Developer Dashboard neu kopieren.")
    ok = ok and step("Suche erreichbar", lambda: f"{len(spotify.request('GET', '/search', user=False, params={'q': 'house', 'type': 'track', 'limit': 1})['tracks']['items'])} Treffer",
                     "Die Web API antwortet nicht – in der Spotify-App muss „Web API“ aktiviert sein.")
    if ok:
        if not spotify.user_token():
            steps.append({"name": "Mit Konto angemeldet", "ok": False, "detail": "",
                          "hint": f"Noch nicht angemeldet. Klappt die Anmeldung nicht, muss in der Spotify-App exakt diese Redirect URI stehen: {config.REDIRECT_URI}"})
            ok = False
        else:
            ok = step("Mit Konto angemeldet", lambda: spotify.me().get("display_name") or "ok", "Die Anmeldung ist ungültig – bitte neu anmelden.")
            ok = ok and step("Playlists lesbar", lambda: f"{len(spotify.playlists())} Playlists", "Playlists lassen sich nicht lesen.")
            ok = ok and step("Lieblingssongs lesbar", lambda: f"{spotify.request('GET', '/me/tracks', params={'limit': 1}).get('total', '?')} Titel", "Lieblingssongs lassen sich nicht lesen.")
    return {"ok": ok, "steps": steps, "redirect_uri": config.REDIRECT_URI}


@app.post("/api/spotify/logout")
def spotify_logout() -> dict:
    spotify.logout()
    db.kv_set("spotify_user", None)
    return {"ok": True}


@app.get("/api/spotify/playlists")
def spotify_playlists() -> list[dict]:
    return spotify_call(spotify.playlists)


class SpotifyImport(BaseModel):
    playlist_id: str | None = None
    liked: bool = False
    as_set: bool = False


def _load_playlist(key: str) -> tuple[str, list[dict]]:
    if key == "liked":
        return "Lieblingssongs", spotify_call(spotify.liked_tracks)
    return spotify_call(spotify.playlist_tracks, key)


def _sync_set(s: dict, track_ids: list[int]) -> dict:
    """Übernimmt Inhalt und Reihenfolge aus Spotify; Pins verbliebener Tracks bleiben."""
    old = [i["track_id"] for i in s["items"]]
    pinned = {i["track_id"] for i in s["items"] if i.get("pinned")}
    new = list(dict.fromkeys(track_ids))
    db.update_set(s["id"], items=[{"track_id": i, "pinned": i in pinned} for i in new])
    kept_old, kept_new = [i for i in old if i in set(new)], [i for i in new if i in set(old)]
    return {"added": len(set(new) - set(old)), "removed": len(set(old) - set(new)), "moved": kept_old != kept_new}


@app.post("/api/spotify/import")
def spotify_import(body: SpotifyImport) -> dict:
    key = "liked" if body.liked else body.playlist_id
    if not key:
        raise HTTPException(400, "playlist_id oder liked angeben")
    name, items = _load_playlist(key)
    ids = importer.run_import(items, name)
    out = {"name": name, "count": len(ids)}
    if body.as_set:
        existing = next((s for s in db.list_sets() if s.get("spotify_playlist_id") == key), None)
        if existing:
            out.update(set_id=existing["id"], changes=_sync_set(existing, ids))
        else:
            unique = list(dict.fromkeys(ids))
            out["set_id"] = db.create_set(name, [{"track_id": i} for i in unique], curve="free",
                                          origin=f"Spotify-Playlist „{name}“", spotify_playlist_id=key)["id"]
    return out


@app.post("/api/sets/{set_id}/refresh")
def refresh_set(set_id: int) -> dict:
    """Set erneut aus seiner Spotify-Playlist laden (nach Änderungen in Spotify)."""
    s = need_set(set_id)
    if not s.get("spotify_playlist_id"):
        raise HTTPException(400, "Dieses Set stammt nicht aus einer Spotify-Playlist")
    name, items = _load_playlist(s["spotify_playlist_id"])
    changes = _sync_set(s, importer.run_import(items, name))
    return {"changes": changes, "set": set_view(need_set(set_id))}


class SpotifyTrack(BaseModel):
    spotify_id: str
    title: str
    artist: str = ""
    duration: float = 0
    isrc: str | None = None


@app.post("/api/tracks/spotify")
def add_spotify_track(body: SpotifyTrack) -> dict:
    ids = importer.run_import([{**body.model_dump(), "album": ""}], "Entdeckt")
    return present(need_track(ids[0]))


# ------------------------------------------------------------------ Sets
class NewSet(BaseModel):
    name: str
    track_ids: list[int] = []
    curve: str = "build"


@app.get("/api/sets")
def sets() -> list[dict]:
    return [{"id": s["id"], "name": s["name"], "count": len(s["items"]), "origin": s["origin"], "updated": s["updated"]} for s in db.list_sets()]


@app.post("/api/sets")
def new_set(body: NewSet) -> dict:
    s = db.create_set(body.name.strip() or "Neues Set", [{"track_id": i} for i in dict.fromkeys(body.track_ids)], body.curve)
    return set_view(s)


@app.get("/api/sets/{set_id}")
def get_set(set_id: int) -> dict:
    return set_view(need_set(set_id))


class SetUpdate(BaseModel):
    name: str | None = None
    curve: str | None = None
    items: list[dict] | None = None
    overrides: dict | None = None


@app.put("/api/sets/{set_id}")
def put_set(set_id: int, body: SetUpdate) -> dict:
    need_set(set_id)
    fields = body.model_dump(exclude_none=True)
    if "items" in fields:
        seen, items = set(), []
        for it in fields["items"]:
            if it["track_id"] not in seen and db.get_track(it["track_id"], light=True):
                seen.add(it["track_id"])
                items.append({"track_id": it["track_id"], "pinned": bool(it.get("pinned"))})
        fields["items"] = items
    return set_view(db.update_set(set_id, **fields))


@app.delete("/api/sets/{set_id}")
def del_set(set_id: int) -> dict:
    db.delete_set(set_id)
    return {"ok": True}


@app.post("/api/sets/{set_id}/autosort")
def autosort(set_id: int) -> dict:
    s = need_set(set_id)
    tracks = set_tracks(s)
    pinned_ids = {i["track_id"] for i in s["items"] if i.get("pinned")}
    pinned = {pos for pos, t in enumerate(tracks) if t["id"] in pinned_ids}
    result = sequence.optimize(tracks, s["curve"], pinned, weights())
    items = [{"track_id": tracks[i]["id"], "pinned": tracks[i]["id"] in pinned_ids} for i in result["order"]]
    return {**set_view(db.update_set(set_id, items=items)), "before": result["before"], "after": result["after"]}


@app.get("/api/sets/{set_id}/suggest")
def suggest(set_id: int, position: int | None = None, family: str = "", limit: int = 12) -> list[dict]:
    """Smart Shuffle aus der eigenen Bibliothek für eine Position im Set (Standard: ans Ende)."""
    s = need_set(set_id)
    tracks = set_tracks(s)
    pos = len(tracks) if position is None else max(0, min(position, len(tracks)))
    after = tracks[pos - 1] if pos > 0 else None
    before = tracks[pos] if pos < len(tracks) else None
    in_set = {t["id"] for t in tracks}
    pool = [db.get_track(t["id"]) for t in db.all_tracks() if t["id"] not in in_set and t["status"] in ("done", "partial") and (not family or t["family"] == family)]
    ranked = suggest_engine.suggest(pool, after, before, weights(), limit)
    by_id = {t["id"]: t for t in pool}
    return [{**r, "track": present(by_id[r["track_id"]]), "verdict": compat.verdict(r["score"])} for r in ranked]


@app.get("/api/sets/{set_id}/discover")
def discover(set_id: int, limit: int = 10) -> list[dict]:
    """Neuentdeckungen: ähnliche Tracks (ReccoBeats), die noch nicht in der Bibliothek sind."""
    tracks = set_tracks(need_set(set_id))
    seeds = [t["spotify_id"] for t in reversed(tracks) if t["spotify_id"]][:5]
    if not seeds:
        return []
    known = {t["spotify_id"] for t in db.all_tracks() if t["spotify_id"]}
    recs = [r for r in reccobeats.recommendations(seeds, 30) if r["spotify_id"] not in known]
    feats = reccobeats.features([r["spotify_id"] for r in recs])
    last, out = tracks[-1], []
    for r in recs:
        cand = {**r, "id": -1, "genres": [], "family": "", **feats.get(r["spotify_id"], {})}
        s = compat.pair_score(last, cand, weights())
        out.append({"track": {**present(cand), "source": "spotify", "status": "partial"}, "score": s["score"], "verdict": s["verdict"], "reasons": s["reasons"]})
    out.sort(key=lambda x: -x["score"])
    return out[:limit]


def plan_for(s: dict, tracks: list[dict], index: int, template: str | None = None) -> dict:
    a, b = tracks[index], tracks[index + 1]
    template = template or s["overrides"].get(f"{a['id']}-{b['id']}")
    return transitions.plan(a, b, deck_a=1 if index % 2 == 0 else 2, template=template)


@app.get("/api/sets/{set_id}/transition/{index}")
def transition(set_id: int, index: int, template: str | None = None) -> dict:
    s = need_set(set_id)
    tracks = set_tracks(s)
    if not 0 <= index < len(tracks) - 1:
        raise HTTPException(404, "Übergang nicht vorhanden")
    a, b = tracks[index], tracks[index + 1]
    if template in transitions.TEMPLATES:
        s = db.update_set(set_id, overrides={**s["overrides"], f"{a['id']}-{b['id']}": template})
    return {"index": index, "a": present(a), "b": present(b), "score": compat.pair_score(a, b, weights()), "plan": plan_for(s, tracks, index)}


@app.get("/api/sets/{set_id}/review")
def review(set_id: int, curve: str = "free", pin_first: bool = False, pin_last: bool = False, focus: str = "balanced",
           order_by: str = "") -> dict:
    s = need_set(set_id)
    tracks = set_tracks(s)
    pinned_ids = {i["track_id"] for i in s["items"] if i.get("pinned")}
    pinned = {pos for pos, t in enumerate(tracks) if t["id"] in pinned_ids}
    if pin_first and tracks:
        pinned.add(0)
    if pin_last and tracks:
        pinned.add(len(tracks) - 1)
    in_set = {t["id"] for t in tracks}
    lib = [db.get_track(t["id"]) for t in db.all_tracks() if t["id"] not in in_set and t["status"] in ("done", "partial")]
    result = review_engine.review(tracks, lib, curve, pinned, weights(), focus, order_by or None)
    by_id = {t["id"]: present(t) for t in tracks + lib}
    for fix in result["fixes"]:
        for opt in fix["options"]:
            if opt["kind"] == "bridge":
                opt["track"] = by_id[opt["track_id"]]
    def brief(order: list[dict]) -> list[dict]:
        out = []
        for i in range(len(order) - 1):
            p = transitions.plan(order[i], order[i + 1], deck_a=1 if i % 2 == 0 else 2)
            out.append({"title": p["title"], "bars": p["automation"]["bars"], "why": p["why"],
                        "out": p["mix_out"]["label"] if p.get("mix_out") else None, "into": p["mix_in"]["label"] if p.get("mix_in") else None})
        return out

    all_by_id = {t["id"]: t for t in tracks}
    result["plans_before"] = brief(tracks)
    result["plans_after"] = brief([all_by_id[i] for i in result["order"]])
    return {**result, "tracks": [by_id[t["id"]] for t in tracks], "name": s["name"], "pinned": sorted(pinned),
            "spotify_playlist_id": s.get("spotify_playlist_id"), "focus_options": review_engine.FOCUS_LABELS, "order_options": review_engine.ORDER_LABELS, "order_by": order_by if order_by in review_engine.ORDER_LABELS else "",
            "pending": sum(1 for t in tracks if t["status"] in ("pending", "analyzing"))}


class Apply(BaseModel):
    order: list[int]
    name: str | None = None


@app.post("/api/sets/{set_id}/apply")
def apply_order(set_id: int, body: Apply) -> dict:
    """Umbau als neues Set speichern – das Original bleibt unverändert."""
    s = need_set(set_id)
    pinned = {i["track_id"] for i in s["items"] if i.get("pinned")}
    items = [{"track_id": i, "pinned": i in pinned} for i in dict.fromkeys(body.order)]
    new = db.create_set(body.name or f"{s['name']} (Umbau)", items, s["curve"], origin=f"Umbau von „{s['name']}“")
    return set_view(new)


@app.post("/api/import/file")
async def import_file(file: UploadFile) -> dict:
    """M3U oder rekordbox-XML als Set laden (für den Playlist-Check)."""
    text = (await file.read()).decode("utf-8", errors="replace")
    name = Path(file.filename or "Playlist").stem
    if text.lstrip().startswith("<"):
        try:
            lists = rekordbox_xml.parse(text)
        except Exception:
            raise HTTPException(400, "Die XML-Datei konnte nicht gelesen werden")
    else:
        lists = [{"name": name, "paths": m3u.parse(text)}]
    created, missing = [], 0
    for pl in lists:
        ids = []
        for p in pl["paths"]:
            path = Path(p)
            if path.is_file() and path.suffix.lower() in config.AUDIO_EXTENSIONS:
                ids.append(library.add_file(path, pl["name"])[0])
            else:
                missing += 1
        if ids:
            library.enqueue(ids)
            ids = list(dict.fromkeys(ids))
            created.append(db.create_set(pl["name"], [{"track_id": i} for i in ids], curve="free", origin=f"Datei {file.filename}")["id"])
    if not created:
        raise HTTPException(400, "Keine der Audiodateien aus der Playlist wurde auf diesem Rechner gefunden")
    return {"set_ids": created, "missing": missing}


# ------------------------------------------------------------------ Exporte
def _export_data(set_id: int) -> tuple[dict, list[dict], list[dict]]:
    s = need_set(set_id)
    tracks = set_tracks(s)
    plans = [plan_for(s, tracks, i) for i in range(len(tracks) - 1)]
    return s, tracks, plans


def _set_cues(tracks: list[dict], plans: list[dict]) -> dict[int, list[dict]]:
    """Cue-Plan je Track im Set: Phasen-Cues und Loops, überlagert von den Mix-Punkten der Übergänge."""
    return {t["id"]: cue_engine.set_cues(t, plans[i - 1] if i > 0 else None, plans[i] if i < len(plans) else None)
            for i, t in enumerate(tracks)}


def _filename(name: str, ext: str) -> str:
    return re.sub(r"[^\w\- ]+", "", name).strip().replace(" ", "_") or "set"


def _download(content: str, media: str, name: str, ext: str) -> Response:
    safe = (_filename(name, ext) + ext).encode("ascii", "ignore").decode() or f"set{ext}"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{safe}"'})


@app.get("/api/sets/{set_id}/export/rekordbox.xml")
def export_rekordbox(set_id: int) -> Response:
    s, tracks, plans = _export_data(set_id)
    cues = _set_cues(tracks, plans)
    phases = {t["id"]: cue_engine.phases(t) for t in tracks}
    return _download(rekordbox_xml.build(s["name"], tracks, cues, phases), "application/xml", s["name"], ".xml")


@app.get("/api/sets/{set_id}/missing.csv")
def missing_csv(set_id: int) -> Response:
    """Tracks des Sets, die noch nicht als Audiodatei vorliegen."""
    import csv
    import io

    s = need_set(set_id)
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["Platz", "Künstler", "Titel", "Album", "Dauer", "BPM", "ISRC", "Spotify"])
    for pos, t in enumerate(set_tracks(s), 1):
        if not t["path"]:
            dur = int(t["duration"] or 0)
            writer.writerow([pos, t["artist"], t["title"], t["album"], f"{dur // 60}:{dur % 60:02d}", t["bpm"] or "", t["isrc"] or "",
                             f"https://open.spotify.com/track/{t['spotify_id']}" if t["spotify_id"] else ""])
    return _download("\ufeff" + buf.getvalue(), "text/csv; charset=utf-8", f"{s['name']} fehlende Tracks", ".csv")


@app.get("/api/sets/{set_id}/export/playlist.m3u")
def export_m3u(set_id: int) -> Response:
    s, tracks, _ = _export_data(set_id)
    return _download(m3u.build(tracks), "audio/x-mpegurl", s["name"], ".m3u")


@app.get("/api/sets/{set_id}/export/cheatsheet.html", response_class=HTMLResponse)
def export_cheatsheet(set_id: int) -> str:
    s, tracks, plans = _export_data(set_id)
    scores = review_engine.rate(tracks, weights())["transitions"]
    return cheatsheet.build(s["name"], tracks, plans, scores, _set_cues(tracks, plans))


@app.post("/api/sets/{set_id}/export/spotify")
def export_spotify(set_id: int) -> dict:
    """Legt eine neue private Spotify-Playlist an. Lokale Tracks werden per Suche zugeordnet."""
    s, tracks, _ = _export_data(set_id)
    if not spotify_call(spotify.user_token):
        raise HTTPException(401, "Bitte zuerst bei Spotify anmelden")
    ids, missing = [], []
    for t in tracks:
        sid = t["spotify_id"]
        if not sid:
            found = spotify.search_track(t["title"], t["artist"], t.get("isrc"), t["duration"])
            if found:
                sid = found["spotify_id"]
                db.update_track(t["id"], spotify_id=sid)
        if sid:
            ids.append(sid)
        else:
            missing.append(f"{t['artist']} – {t['title']}" if t["artist"] else t["title"])
    if not ids:
        raise HTTPException(400, "Keiner der Tracks wurde bei Spotify gefunden")
    result = spotify_call(spotify.create_playlist, s["name"], ids, "Erstellt mit SetTracker")
    return {**result, "added": len(ids), "missing": missing}


EXTERNAL_HOSTS = {"accounts.spotify.com", "open.spotify.com", "developer.spotify.com"}


class External(BaseModel):
    url: str


@app.post("/api/open-external")
def open_external(body: External) -> dict:
    """Öffnet eine Adresse im Standardbrowser des Rechners.

    Das eingebettete Programmfenster darf selbst keine neuen Browserfenster öffnen (das wird nach
    einer Hintergrundabfrage stillschweigend blockiert), deshalb übernimmt das der Server.
    Erlaubt sind nur Spotify-Seiten und eigene Seiten dieser App.
    """
    import webbrowser
    from urllib.parse import urlparse

    url = body.url
    if url.startswith("/api/"):
        url = f"http://{config.HOST}:{config.PORT}{url}"
    else:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in EXTERNAL_HOSTS:
            raise HTTPException(400, "Diese Adresse darf nicht geöffnet werden")
    if not webbrowser.open(url):
        raise HTTPException(500, "Der Browser ließ sich nicht öffnen")
    return {"ok": True}


@app.get("/api/tutorial/transitions")
def tutorial_transitions() -> list[dict]:
    """Lernbereich: Übergangsarten mit Erklärung und Übungsschritten."""
    return tutorial.lessons()


class Quit(BaseModel):
    confirm: bool


@app.post("/api/quit")
def quit_app(body: Quit) -> dict:
    """Beendet SetTracker (die installierte App hat kein Fenster zum Schließen)."""
    if not body.confirm:
        raise HTTPException(400, "Nicht bestätigt")
    import os
    import threading

    threading.Timer(0.4, lambda: os._exit(0)).start()
    return {"ok": True}


# ------------------------------------------------------------------ Oberfläche
if (config.STATIC_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=config.STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise HTTPException(404)
    target = config.STATIC_DIR / path
    if path and target.is_file() and config.STATIC_DIR in target.resolve().parents:
        return FileResponse(target)
    index = config.STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    return PlainTextResponse("Oberfläche noch nicht gebaut: im Ordner frontend `npm install && npm run build` ausführen.", status_code=503)
