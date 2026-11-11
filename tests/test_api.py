import xml.etree.ElementTree as ET

import pytest
from fastapi.testclient import TestClient

from settracker import db
from settracker.app import app
from settracker.export import m3u, rekordbox_xml
from settracker.spotify import importer, reccobeats


@pytest.fixture()
def api(lib):
    return TestClient(app)


@pytest.fixture()
def demo_set(api, lib):
    order = ["Liquid Sky", "Morning Light", "Steel Tunnel", "Rooftop Groove", "Warehouse Jack"]
    r = api.post("/api/sets", json={"name": "Test Set", "track_ids": [lib[t]["id"] for t in order]})
    yield r.json()
    api.delete(f"/api/sets/{r.json()['id']}")


def test_library_and_waveform(api, lib):
    tracks = api.get("/api/tracks").json()
    assert len(tracks) >= 8
    t = next(t for t in tracks if t["title"] == "Liquid Sky")
    assert t["family"] == "Drum & Bass" and t["has_analysis"] and t["intro_bars"] == 16 and "analysis" not in t
    wf = api.get(f"/api/tracks/{t['id']}/waveform").json()
    assert wf["sections"][0]["kind"] == "intro"
    assert api.get(f"/api/tracks/{t['id']}/audio").status_code == 200


def test_set_flow(api, lib, demo_set):
    sid = demo_set["id"]
    assert len(demo_set["rating"]["transitions"]) == 4
    first = demo_set["items"][0]["track"]["id"]
    items = [{"track_id": i["track"]["id"], "pinned": i["track"]["id"] == first} for i in demo_set["items"]]
    api.put(f"/api/sets/{sid}", json={"items": items, "curve": "free"})
    sorted_view = api.post(f"/api/sets/{sid}/autosort").json()
    assert sorted_view["items"][0]["track"]["id"] == first and sorted_view["items"][0]["pinned"]
    assert sorted_view["after"] > sorted_view["before"]

    sugg = api.get(f"/api/sets/{sid}/suggest").json()
    assert sugg and all(s["track"]["id"] not in {i["track"]["id"] for i in sorted_view["items"]} for s in sugg)
    only_dnb = api.get(f"/api/sets/{sid}/suggest", params={"family": "Drum & Bass"}).json()
    assert {s["track"]["family"] for s in only_dnb} == {"Drum & Bass"}

    tr = api.get(f"/api/sets/{sid}/transition/1").json()
    assert tr["plan"]["steps"] and tr["plan"]["deck_a"] == 2
    forced = api.get(f"/api/sets/{sid}/transition/1", params={"template": "filter_fade"}).json()
    assert forced["plan"]["template"] == "filter_fade"
    assert api.get(f"/api/sets/{sid}/transition/1").json()["plan"]["template"] == "filter_fade"
    assert api.get(f"/api/sets/{sid}/transition/9").status_code == 404


def test_review_and_apply(api, demo_set):
    sid = demo_set["id"]
    r = api.get(f"/api/sets/{sid}/review", params={"pin_first": True}).json()
    assert r["recommend_rebuild"] and r["order"][0] == demo_set["items"][0]["track"]["id"]
    new = api.post(f"/api/sets/{sid}/apply", json={"order": r["order"]}).json()
    assert new["id"] != sid and new["name"].endswith("(Umbau)")
    assert new["rating"]["overall"] > demo_set["rating"]["overall"]
    assert [i["track"]["id"] for i in api.get(f"/api/sets/{sid}").json()["items"]] == [i["track"]["id"] for i in demo_set["items"]]
    api.delete(f"/api/sets/{new['id']}")


def test_exports_roundtrip(api, lib, demo_set, tmp_path):
    sid = demo_set["id"]
    xml = api.get(f"/api/sets/{sid}/export/rekordbox.xml")
    assert xml.status_code == 200 and "attachment" in xml.headers["content-disposition"]
    root = ET.fromstring(xml.text)
    assert root.tag == "DJ_PLAYLISTS" and len(root.findall("./COLLECTION/TRACK")) == 5
    track = root.find("./COLLECTION/TRACK")
    assert track.get("Location").startswith("file://localhost/") and track.find("TEMPO") is not None
    marks = list(root.iter("POSITION_MARK"))
    assert {m.get("Name") for m in marks} >= {"MIX IN", "MIX OUT", "LOOP INTRO", "LOOP OUTRO", "BREAK", "INTRO", "OUTRO"}
    loops = [m for m in marks if m.get("Type") == "4"]
    assert loops and all(float(m.get("End")) > float(m.get("Start")) and m.get("Num") in ("4", "5") for m in loops)
    assert any(m.get("Num") == "-1" and m.get("Name") == "BREAK" for m in marks)  # Phasen als Memory Cues
    parsed = rekordbox_xml.parse(xml.text)
    assert parsed[0]["name"] == "Test Set" and parsed[0]["paths"][0] == lib["Liquid Sky"]["path"]

    text = api.get(f"/api/sets/{sid}/export/playlist.m3u").text
    assert m3u.parse(text) == [i["track"]["path"] for i in demo_set["items"]]
    sheet = api.get(f"/api/sets/{sid}/export/cheatsheet.html").text
    assert "Liquid Sky" in sheet and "Deck 1 → Deck 2" in sheet and "LOOP OUTRO" in sheet

    up = api.post("/api/import/file", files={"file": ("Abend.m3u", text.encode())}).json()
    imported = api.get(f"/api/sets/{up['set_ids'][0]}").json()
    assert imported["name"] == "Abend" and len(imported["items"]) == 5
    api.delete(f"/api/sets/{imported['id']}")
    assert api.post("/api/import/file", files={"file": ("leer.m3u", b"/gibt/es/nicht.mp3\n")}).status_code == 400


def test_spotify_import_links_local_files_and_enriches(lib, monkeypatch):
    monkeypatch.setattr(reccobeats, "features", lambda ids: {"sp_new": {"bpm": 174.0, "camelot": "4A", "energy": 0.9, "valence": 0.4}})
    monkeypatch.setattr(importer.musicbrainz, "artist_genres", lambda name, isrc=None: ["drum and bass", "liquid funk"])
    items = [
        {"spotify_id": "sp_local", "title": "Liquid Sky (Original Mix)", "artist": "Demo Roller", "album": "", "duration": lib["Liquid Sky"]["duration"], "isrc": None},
        {"spotify_id": "sp_new", "title": "Stream Only", "artist": "Somebody", "album": "", "duration": 200, "isrc": "XX1"},
        {"spotify_id": "sp_unknown", "title": "No Data", "artist": "", "album": "", "duration": 100, "isrc": None},
    ]
    ids = importer.run_import(items, "Meine Playlist", background=False)
    local, new, unknown = db.get_tracks(ids)
    assert local["id"] == lib["Liquid Sky"]["id"] and local["spotify_id"] == "sp_local" and local["source"] == "local"
    assert "Meine Playlist" in local["collections"]
    assert new["status"] == "partial" and new["bpm"] == 174.0 and new["family"] == "Drum & Bass"
    assert unknown["status"] == "error"
    assert importer.run_import(items, "Meine Playlist", background=False) == ids  # kein Duplikat
    for t in (new, unknown):
        db.delete_track(t["id"])


def test_reccobeats_field_mapping():
    fields = reccobeats.to_fields({"tempo": 122.746, "key": 2, "mode": 1, "energy": 0.697, "valence": 0.476, "loudness": -8.6})
    assert fields["bpm"] == 122.7 and fields["camelot"] == "10B" and fields["energy"] == 0.697
    assert "camelot" not in reccobeats.to_fields({"tempo": 100, "key": -1, "mode": 1})


def test_spotify_credentials_are_validated_and_stored(api, monkeypatch, tmp_path):
    from settracker import config
    from settracker.spotify import client

    monkeypatch.setattr(config, "ENV_FILE", tmp_path / ".env")
    monkeypatch.setattr(config, "data_dir", lambda: tmp_path)
    monkeypatch.setenv("SPOTIPY_CLIENT_ID", "")
    monkeypatch.setenv("SPOTIPY_CLIENT_SECRET", "")
    assert api.post("/api/spotify/credentials", json={"client_id": "kurz", "client_secret": "x"}).status_code == 400

    class Reply:
        status_code = 401

    monkeypatch.setattr(client.httpx, "post", lambda *a, **k: Reply())
    bad = api.post("/api/spotify/credentials", json={"client_id": "a" * 32, "client_secret": "b" * 32})
    assert bad.status_code == 400 and not (tmp_path / ".env").exists()

    Reply.status_code = 200
    (tmp_path / ".env").write_text("ANDERES=1\nSPOTIPY_CLIENT_ID=alt\n")
    ok = api.post("/api/spotify/credentials", json={"client_id": "a" * 32, "client_secret": "b" * 32})
    assert ok.status_code == 200 and "b" * 32 not in ok.text
    assert (tmp_path / ".env").read_text().splitlines() == ["ANDERES=1", "SPOTIPY_CLIENT_ID=" + "a" * 32, "SPOTIPY_CLIENT_SECRET=" + "b" * 32]
    assert client.configured()


def test_quit_requires_confirmation(api):
    assert api.post("/api/quit", json={"confirm": False}).status_code == 400
    assert api.post("/api/quit", data="confirm=true").status_code == 422


def test_track_detail_has_cues_and_spotify_check_reports_steps(api, lib, monkeypatch):
    detail = api.get(f"/api/tracks/{lib['Liquid Sky']['id']}").json()
    assert detail["cues"][0]["name"] == "INTRO" and detail["phases"][-1]["name"] == "OUTRO"

    monkeypatch.setenv("SPOTIPY_CLIENT_ID", "")
    check = api.get("/api/spotify/check").json()
    assert not check["ok"] and check["steps"][0]["ok"] is False and "Client ID" in check["steps"][0]["hint"]
    bad = api.get("/callback", params={"error": "access_denied"})
    assert bad.status_code == 400 and "abgelehnt" in bad.text


def _spotify_item(sid, title, artist, duration, isrc=None):
    return {"spotify_id": sid, "title": title, "artist": artist, "album": "", "duration": duration, "isrc": isrc}


def test_local_file_takes_over_spotify_entry(api, lib, monkeypatch, tmp_path):
    """Erst in Spotify planen, dann Dateien nachladen: Die Datei übernimmt den Eintrag im Set."""
    import soundfile as sf

    from settracker import demo, library

    monkeypatch.setattr(reccobeats, "features", lambda ids: {i: {"bpm": 99.0, "camelot": "1A", "energy": 0.5, "valence": 0.5} for i in ids})
    monkeypatch.setattr(importer.musicbrainz, "artist_genres", lambda name, isrc=None: ["house"])
    ids = importer.run_import([_spotify_item("sp_a", "Fresh Cut (Extended Mix)", "New Artist", 61),
                               _spotify_item("sp_b", "Other Song", "Somebody Else", 200)], "Planung", background=False)
    view = api.post("/api/sets", json={"name": "Geplant", "track_ids": ids}).json()
    assert view["files"] == {"local": 0, "analyzed": 0, "total": 2}
    assert not api.get(f"/api/sets/{view['id']}/transition/0").json()["plan"]["precise"]
    csv = api.get(f"/api/sets/{view['id']}/missing.csv").text
    assert "Fresh Cut" in csv and "Other Song" in csv and "open.spotify.com/track/sp_a" in csv

    folder = tmp_path / "Gekauft"
    folder.mkdir()
    sf.write(folder / "New Artist - Fresh Cut.wav", demo.synth(128, 9, False, (8, 8, 4, 8, 4)), demo.SR)
    sf.write(folder / "New Artist - Ganz Anderes Lied.wav", demo.synth(120, 4, False, (4, 8, 4, 8, 4)), demo.SR)
    result = api.post("/api/library/scan", json={"path": str(folder)}).json()
    assert result["found"] == 2 and result["linked"] == 1 and result["added"] == 1
    library.wait_idle()

    track = db.get_track(ids[0])
    assert track["source"] == "local" and track["spotify_id"] == "sp_a" and track["status"] == "done"
    assert track["bpm"] == 128 and track["analysis"]["sections"] and track["title"] == "Fresh Cut (Extended Mix)"
    after = api.get(f"/api/sets/{view['id']}").json()
    assert [i["track"]["id"] for i in after["items"]] == ids and after["files"] == {"local": 1, "analyzed": 1, "total": 2}
    assert "Fresh Cut" not in api.get(f"/api/sets/{view['id']}/missing.csv").text
    assert api.get(f"/api/tracks/{ids[0]}").json()["cues"][0]["estimated"] is False

    # Von Hand zuordnen: die zweite Datei dem zweiten Spotify-Eintrag geben
    other = next(t for t in db.all_tracks() if t["title"] == "Ganz Anderes Lied")
    cands = api.get(f"/api/tracks/{ids[1]}/link-candidates").json()
    assert other["id"] in [c["id"] for c in cands]
    api.put(f"/api/sets/{view['id']}", json={"items": [{"track_id": ids[0]}, {"track_id": other["id"]}, {"track_id": ids[1]}]})
    linked = api.post(f"/api/tracks/{ids[1]}/link", json={"other_id": other["id"]}).json()
    assert linked["source"] == "local" and linked["bpm"] == 120 and db.get_track(other["id"]) is None
    merged = api.get(f"/api/sets/{view['id']}").json()
    assert [i["track"]["id"] for i in merged["items"]] == ids and merged["files"]["local"] == 2
    assert api.get(f"/api/sets/{view['id']}/transition/0").json()["plan"]["precise"]
    assert api.post(f"/api/tracks/{ids[1]}/link", json={"other_id": ids[0]}).status_code == 400

    # und wieder lösen
    split = api.post(f"/api/tracks/{ids[1]}/unlink").json()
    assert split["spotify"]["source"] == "spotify" and split["spotify"]["bpm"] == 99.0
    library.wait_idle()
    assert db.get_track(split["file_id"])["path"].endswith("Ganz Anderes Lied.wav")
    api.delete(f"/api/sets/{view['id']}")
    for i in (*ids, split["file_id"]):
        db.delete_track(i)


def test_spotify_playlist_refresh_keeps_set_and_pins(api, lib, monkeypatch):
    from settracker.spotify import client

    monkeypatch.setattr(reccobeats, "features", lambda ids: {i: {"bpm": 124.0, "camelot": "8A", "energy": 0.6, "valence": 0.5} for i in ids})
    monkeypatch.setattr(importer.musicbrainz, "artist_genres", lambda name, isrc=None: [])
    monkeypatch.setattr(importer, "run_import", lambda items, name, background=True, _orig=importer.run_import: _orig(items, name, background=False))
    a, b, c, d = (_spotify_item(f"pl_{x}", f"Song {x}", "Band", 180 + i) for i, x in enumerate("abcd"))
    playlist = {"items": [a, b, c]}
    monkeypatch.setattr(client, "playlist_tracks", lambda pid: ("Samstag", playlist["items"]))

    first = api.post("/api/spotify/import", json={"playlist_id": "PL1", "as_set": True}).json()
    view = api.get(f"/api/sets/{first['set_id']}").json()
    assert view["spotify_playlist_id"] == "PL1" and [i["track"]["title"] for i in view["items"]] == ["Song a", "Song b", "Song c"]
    items = [{"track_id": i["track"]["id"], "pinned": i["track"]["title"] == "Song c"} for i in view["items"]]
    api.put(f"/api/sets/{view['id']}", json={"items": items})

    playlist["items"] = [c, a, d]  # in Spotify umgebaut: b raus, d rein, c nach vorn
    refreshed = api.post(f"/api/sets/{view['id']}/refresh").json()
    assert refreshed["changes"] == {"added": 1, "removed": 1, "moved": True}
    assert [(i["track"]["title"], i["pinned"]) for i in refreshed["set"]["items"]] == [("Song c", True), ("Song a", False), ("Song d", False)]
    again = api.post("/api/spotify/import", json={"playlist_id": "PL1", "as_set": True}).json()
    assert again["set_id"] == view["id"] and again["changes"] == {"added": 0, "removed": 0, "moved": False}
    assert api.post(f"/api/sets/{api.post('/api/sets', json={'name': 'ohne'}).json()['id']}/refresh").status_code == 400
    for t in db.all_tracks():
        if (t["spotify_id"] or "").startswith("pl_"):
            db.delete_track(t["id"])
    api.delete(f"/api/sets/{view['id']}")


def test_desktop_falls_back_to_browser_when_window_fails(monkeypatch):
    import sys
    import types

    from settracker import config, desktop

    monkeypatch.setattr(config, "DESKTOP", False)  # wird nach dem Test auf False zurückgesetzt

    # Bibliothek fehlt
    monkeypatch.setitem(sys.modules, "webview", None)
    assert desktop.open_window("http://127.0.0.1:1") is False and config.DESKTOP is False

    # Bibliothek da, aber der Fensterstart scheitert (z. B. kein WebView2)
    calls = {}

    def start(*args, **kwargs):
        calls["start"] = kwargs
        raise RuntimeError("kein Fenstersystem")

    fake = types.SimpleNamespace(settings={}, create_window=lambda *a, **k: calls.setdefault("window", (a, k)) and object(), start=start)
    monkeypatch.setitem(sys.modules, "webview", fake)
    assert desktop.open_window("http://127.0.0.1:1") is False and config.DESKTOP is False
    assert fake.settings["ALLOW_DOWNLOADS"] is True and calls["start"]["private_mode"] is False
    assert calls["window"][1]["min_size"] == desktop.MIN_SIZE

    # Erfolgreicher Start: blockiert bis zum Schließen und meldet True
    fake.start = lambda *a, **k: None
    assert desktop.open_window("http://127.0.0.1:1") is True and config.DESKTOP is True


def test_callback_page_depends_on_window_mode(api, monkeypatch):
    from settracker import config
    from settracker.spotify import client

    monkeypatch.setattr(client, "finish_login", lambda code: None)
    assert api.get("/api/status").json()["desktop"] is False
    browser = api.get("/callback", params={"code": "abc"}, follow_redirects=False)
    assert browser.status_code == 307 and browser.headers["location"] == "/#/bibliothek"
    monkeypatch.setattr(config, "DESKTOP", True)
    window = api.get("/callback", params={"code": "abc"}, follow_redirects=False)
    assert window.status_code == 200 and "Anmeldung erfolgreich" in window.text
    assert api.get("/api/status").json()["desktop"] is True


def test_open_external_only_allows_spotify_and_own_pages(api, monkeypatch):
    import webbrowser

    opened = []
    monkeypatch.setattr(webbrowser, "open", lambda url: opened.append(url) or True)
    ok = api.post("/api/open-external", json={"url": "https://accounts.spotify.com/authorize?client_id=x&redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fcallback"})
    assert ok.status_code == 200 and opened[-1].startswith("https://accounts.spotify.com/authorize?client_id=x&redirect_uri=http%3A")
    assert api.post("/api/open-external", json={"url": "/api/sets/1/export/cheatsheet.html"}).status_code == 200
    assert opened[-1] == "http://127.0.0.1:8000/api/sets/1/export/cheatsheet.html"
    for bad in ("https://example.org/", "http://accounts.spotify.com/x", "file:///etc/passwd", "https://accounts.spotify.com.evil.org/", "javascript:alert(1)"):
        assert api.post("/api/open-external", json={"url": bad}).status_code == 400, bad
    assert len(opened) == 2


def test_bare_callback_explains_itself(api):
    page = api.get("/callback")
    assert page.status_code == 400 and "Rücksprungziel" in page.text and "kein Code" not in page.text
