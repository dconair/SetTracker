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
