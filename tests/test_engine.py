from settracker.engine import compat, review, sequence, suggest, transitions


def test_pair_score_ranks_sensible_neighbours(lib):
    good = compat.pair_score(lib["Morning Light"], lib["Rooftop Groove"])
    bad = compat.pair_score(lib["Rooftop Groove"], lib["Liquid Sky"])
    assert good["score"] > 0.8 and good["verdict"] == "good"
    assert bad["score"] < 0.5 and bad["verdict"] == "bad"
    assert any("Genrebruch" in i or "Temposprung" in i for i in bad["issues"])


def test_unknown_features_are_neutral(lib):
    a = lib["Morning Light"]
    spotify_only = {"id": 99, "bpm": a["bpm"], "camelot": None, "energy": None, "family": "", "genres": []}
    s = compat.pair_score(a, spotify_only)
    assert s["parts"]["key"]["score"] is None and s["parts"]["wave"]["score"] is None
    assert s["score"] == 1.0 and s["confidence"] < 0.5


def test_halftime_tempo():
    tm = compat.tempo_match(87, 174)
    assert tm["factor"] == 0.5 and abs(tm["pct"]) < 0.01


def test_optimize_improves_and_respects_pins(lib):
    order = ["Liquid Sky", "Morning Light", "Steel Tunnel", "Rooftop Groove", "Night Bus", "Warehouse Jack", "Sunset Piano", "Peak Pressure"]
    tracks = [lib[t] for t in order]
    result = sequence.optimize(tracks, "free", pinned={0, 7})
    assert sorted(result["order"]) == list(range(8))
    assert result["order"][0] == 0 and result["order"][7] == 7
    assert result["after"] > result["before"]
    free = sequence.optimize(tracks, "free")
    assert free["after"] >= result["after"]


def test_build_curve_orders_energy_upwards(lib):
    house = [lib[t] for t in ("Peak Pressure", "Morning Light", "Warehouse Jack", "Rooftop Groove")]
    result = sequence.optimize(house, "build", curve_weight=0.6)
    energies = [house[i]["energy"] for i in result["order"]]
    assert energies == sorted(energies)


def test_review_finds_problems_and_rebuild(lib):
    order = ["Liquid Sky", "Morning Light", "Steel Tunnel", "Rooftop Groove", "Night Bus", "Warehouse Jack"]
    tracks = [lib[t] for t in order]
    result = review.review(tracks, list(lib.values()), curve="free", pinned={0})
    assert result["before"]["counts"]["bad"] >= 3
    assert result["recommend_rebuild"] and result["gain"] > 0.1
    assert result["order"][0] == tracks[0]["id"]
    assert sorted(result["order"]) == sorted(t["id"] for t in tracks)
    kinds = {o["kind"] for f in result["fixes"] for o in f["options"]}
    assert "swap" in kinds
    assert len(result["fixes"]) == result["before"]["counts"]["bad"]


def test_review_of_good_playlist_needs_no_rebuild(lib):
    tracks = [lib[t] for t in ("Morning Light", "Rooftop Groove", "Warehouse Jack", "Peak Pressure")]
    result = review.review(tracks, [], curve="free")
    assert result["before"]["counts"]["bad"] == 0
    assert "kritisch" in result["summary"]


def test_suggest_prefers_compatible_tracks(lib):
    pool = [t for t in lib.values() if t["title"] != "Morning Light"]
    ranked = suggest.suggest(pool, lib["Morning Light"], None, limit=3)
    titles = [next(t["title"] for t in pool if t["id"] == r["track_id"]) for r in ranked]
    assert titles[0] == "Rooftop Groove"
    assert "Liquid Sky" not in titles
    bridge = suggest.suggest(pool, lib["Morning Light"], lib["Warehouse Jack"], limit=1)[0]
    assert next(t["title"] for t in pool if t["id"] == bridge["track_id"]) in ("Rooftop Groove", "Sunset Piano")


def test_transition_templates(lib):
    blend = transitions.plan(lib["Warehouse Jack"], lib["Steel Tunnel"], template="bass_swap")
    assert blend["bars"] == 16 and blend["precise"]
    assert blend["mix_out"]["bar"] == 53  # Outro beginnt nach 52 Takten
    assert {c["name"] for c in blend["cues_a"]} == {"MIX OUT", "BASS SWAP"}
    assert blend["cues_b"][0]["name"] == "MIX IN" and blend["cues_b"][1]["name"] == "DROP"
    assert any("EQ LOW" in s["text"] for s in blend["steps"])

    auto = transitions.plan(lib["Morning Light"], lib["Rooftop Groove"])
    assert auto["template"] == "bass_swap" and auto["bars"] == 8
    assert auto["tempo"]["target_bpm"] == 120 and auto["tempo"]["in_range"]

    jump = transitions.plan(lib["Rooftop Groove"], lib["Liquid Sky"], deck_a=2)
    assert jump["template"] == "smart_fader" and jump["deck_b"] == 1 and jump["tempo"] is None
    clash = transitions.plan(lib["Warehouse Jack"], lib["Peak Pressure"], template="echo_out")
    assert any("ECHO" in s["text"] for s in clash["steps"])


def test_transition_without_audio_is_generic(lib):
    spotify_only = {"id": 99, "title": "Stream", "artist": "X", "bpm": 124, "camelot": "8A", "energy": 0.6, "analysis": None}
    plan = transitions.plan(lib["Rooftop Groove"], spotify_only)
    assert not plan["precise"] and "mix_out" not in plan and plan["cues_a"] == []
    assert plan["steps"][-1]["when"] == "Hinweis"
