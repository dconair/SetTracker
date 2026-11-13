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
    blend = transitions.plan(lib["Warehouse Jack"], lib["Steel Tunnel"], template="blend")
    assert blend["bars"] == 16 and blend["precise"]
    assert blend["mix_out"]["bar"] == 53  # Outro beginnt nach 52 Takten
    assert {c["name"] for c in blend["cues_a"]} == {"MIX OUT", "BASS SWAP"}
    assert blend["cues_b"][0]["name"] == "MIX IN" and blend["cues_b"][1]["name"] == "DROP"
    swap = next(s for s in blend["steps"] if "EQ LOW Deck 1" in s["text"])
    assert swap["when"] == "Takt 9 (auf die Eins)" and "von 12 Uhr auf 7 Uhr" in swap["text"] and swap["why"]
    assert set(swap["controls"]) == {"low_1", "low_2"} and swap["bar_from"] == 9

    auto = transitions.plan(lib["Morning Light"], lib["Rooftop Groove"])
    assert auto["template"] == "rise" and auto["bars"] == 8          # 8 Takte Outro/Intro, Nachbartonart
    assert auto["tempo"]["target_bpm"] == 120 and auto["tempo"]["in_range"]
    long_blend = transitions.plan(lib["Warehouse Jack"], lib["Peak Pressure"])
    assert long_blend["suggested"] in ("blend", "rise", "fade")

    jump = transitions.plan(lib["Rooftop Groove"], lib["Liquid Sky"], deck_a=2)
    assert jump["template"] == "smart_fader" and jump["deck_b"] == 1 and jump["tempo"] is None
    echo = transitions.plan(lib["Warehouse Jack"], lib["Peak Pressure"], template="echo_out")
    assert any("ECHO" in s["text"] for s in echo["steps"]) and echo["automation"]["b_start_bar"] == 2
    assert transitions.plan(lib["Morning Light"], lib["Rooftop Groove"], template="filter_fade")["template"] == "rise"  # alte Vorlage


def test_automation_is_consistent_for_every_template():
    from settracker.engine import automation, flx4

    for template in transitions.TEMPLATES:
        for bars in (1, 2, 4, 8, 16, 32):
            auto = automation.build(template, bars, 1, 2)
            for cid, pts in auto["controls"].items():
                assert all(0 <= v <= 1 for _, v in pts), (template, cid)
                assert [b for b, _ in pts] == sorted(b for b, _ in pts), (template, cid)
                assert 0 <= pts[0][0] and pts[-1][0] <= bars, (template, cid)
            # Bass-Regel: nie beide Bässe gleichzeitig voll offen, solange beide Kanäle hörbar sind
            curves = automation.recipe(template, bars)
            if "low_a" in curves and "low_b" in curves:
                for step in range(bars * 4 + 1):
                    bar = step / 4
                    both = automation.value_at(curves["low_a"], bar) >= 0.5 and automation.value_at(curves["low_b"], bar) >= 0.5
                    assert not both or bar == bars / 2, (template, bars, bar)
    assert automation.value_at([[0, 0], [4, 1]], 1) == 0.25 and automation.value_at([[0, 1], [2, 1], [2, 0]], 2) == 0
    assert flx4.clock(0) == "7 Uhr" and flx4.clock(0.5) == "12 Uhr" and flx4.clock(1) == "5 Uhr" and flx4.clock(0.2) == "9 Uhr"

    # Jede Reglerbewegung der Automation taucht als Schritt mit denselben Bedienelementen auf
    a = {"title": "A", "artist": "", "bpm": 124.0, "duration": 0, "analysis": None}
    for template in transitions.TEMPLATES:
        plan = transitions.plan(a, {**a, "title": "B"}, template=template)
        moved = {cid for cid, pts in plan["automation"]["controls"].items() if len({v for _, v in pts}) > 1}
        named = {c for s in plan["steps"] if s["bar_from"] for c in s["controls"]}
        assert moved <= named, (template, moved - named)


def test_transition_without_audio_is_generic(lib):
    spotify_only = {"id": 99, "title": "Stream", "artist": "X", "bpm": 124, "camelot": "8A", "energy": 0.6, "analysis": None}
    plan = transitions.plan(lib["Rooftop Groove"], spotify_only)
    assert not plan["precise"] and "mix_out" not in plan and plan["cues_a"] == []
    assert plan["steps"][-1]["when"] == "Hinweis" and plan["automation"]["controls"]


def test_track_cues_label_phases_and_loops(lib):
    from settracker.engine import cues

    track = lib["Warehouse Jack"]  # Aufbau: 16 Intro, 16 Haupt, 4 Break, 16 Haupt, 16 Outro
    plan = {c["pad"]: c for c in cues.track_cues(track)}
    assert [plan[p]["name"] for p in sorted(plan)] == ["INTRO", "DROP", "BREAK", "DROP 2", "LOOP INTRO", "LOOP OUTRO", "OUTRO"]
    assert plan[2]["bar"] == 17 and plan[3]["bar"] == 33 and plan[4]["bar"] == 37 and plan[8]["bar"] == 53
    bar_len = track["analysis"]["bar_len"]
    for pad in (5, 6):
        assert plan[pad]["kind"] == "loop" and abs(plan[pad]["end"] - plan[pad]["time"] - 4 * bar_len) < 0.01
    assert plan[6]["time"] == plan[8]["time"] and plan[1]["letter"] == "A" and plan[8]["letter"] == "H"
    assert [p["name"] for p in cues.phases(track)] == ["INTRO", "DROP", "BREAK", "DROP 2", "OUTRO"]


def test_cues_without_audio_are_marked_estimated():
    from settracker.engine import cues

    plan = cues.track_cues({"bpm": 120.0, "duration": 300, "analysis": None})
    assert plan and all(c["estimated"] for c in plan)
    assert plan[0]["name"] == "START" and plan[-1]["name"] == "MIX OUT?" and plan[-1]["pad"] == 8
    assert cues.track_cues({"bpm": None, "duration": 300, "analysis": None}) == []


def test_set_cues_take_mix_points_from_transitions(lib):
    from settracker.engine import cues

    a, b = lib["Warehouse Jack"], lib["Steel Tunnel"]
    plan = transitions.plan(a, b, template="bass_swap")
    out = {c["pad"]: c["name"] for c in cues.set_cues(a, None, plan)}
    assert out[8] == "MIX OUT" and out[7] == "BASS SWAP" and out[6] == "LOOP OUTRO" and out[1] == "INTRO"
    into = {c["pad"]: c["name"] for c in cues.set_cues(b, plan, None)}
    assert into[1] == "MIX IN" and into[2] == "DROP" and into[5] == "LOOP INTRO"


def _t(i, bpm, camelot, energy, valence, family="House"):
    return {"id": i, "title": f"T{i}", "artist": "", "bpm": bpm, "camelot": camelot, "energy": energy, "valence": valence,
            "family": family, "genres": [], "analysis": None}


def test_findings_name_each_problem_once():
    tracks = [
        _t(1, 124, "8A", 0.60, 0.60), _t(2, 125, "8A", 0.62, 0.62), _t(3, 150, "9A", 0.64, 0.60),   # Tempo-Ausreißer
        _t(4, 126, "9A", 0.66, 0.62), _t(5, 126, "3A", 0.66, 0.60),                                  # Tonart-Clash 9A→3A
        _t(6, 127, "3A", 0.20, 0.12), _t(7, 127, "3A", 0.68, 0.14, "Techno"), _t(8, 128, "4A", 0.70, 0.16),
        {**_t(9, None, None, None, None), "family": ""},
    ]
    result = review.findings(tracks, review.rate(tracks))
    kinds = [(f["kind"], f["index"]) for f in result]
    assert ("tempo_outlier", 2) in kinds and not any(k == "tempo_jump" and i in (1, 2) for k, i in kinds)
    assert ("key_clash", 3) in kinds and ("mood_break", 4) in kinds
    assert ("energy_dip", 5) in kinds and ("no_data", 8) in kinds
    assert len(kinds) == len(set(kinds))
    assert result[0]["severity"] == "high" and "150 BPM" in result[0]["text"]
    clean = [_t(1, 124, "8A", 0.6, 0.6), _t(2, 125, "8A", 0.62, 0.6), _t(3, 126, "9A", 0.65, 0.62)]
    assert review.findings(clean, review.rate(clean)) == []


def test_genre_outlier_and_mood_focus_orders_by_mood():
    tracks = [_t(1, 124, "8A", 0.6, 0.6), _t(2, 124, "8A", 0.6, 0.6, "Hip-Hop"), _t(3, 124, "8A", 0.6, 0.6)]
    assert [f["kind"] for f in review.findings(tracks, review.rate(tracks))] == ["genre_outlier"]

    # Gleiches Tempo/Tonart/Genre – nur die Stimmung springt: mit Stimmungsgewicht wird sie geglättet.
    mixed = [_t(i, 124, "8A", 0.6, v) for i, v in enumerate([0.1, 0.9, 0.2, 0.8, 0.15, 0.85])]
    jumps = lambda order: sum(abs(mixed[a]["valence"] - mixed[b]["valence"]) for a, b in zip(order, order[1:]))  # noqa: E731
    with_mood = sequence.optimize(mixed, "free", mood_weight=0.5)["order"]
    assert jumps(with_mood) < jumps(list(range(6))) / 2
    r = review.review(mixed, [], focus="mood")
    assert r["recommend_rebuild"] and r["after"]["mood_score"] > r["before"]["mood_score"] and r["mood_gain"] > 0.2


def test_steps_carry_bar_ranges_and_tutorial_lessons():
    from settracker.engine import flx4, tutorial

    assert flx4._bars("Takt 5–8") == (5, 8) and flx4._bars("Takt 3") == (3, 3)
    assert flx4._bars("Nach Takt 16") == (17, 17) and flx4._bars("Vorbereitung") == (None, None)
    lessons = tutorial.lessons()
    assert {lesson["key"] for lesson in lessons} == set(transitions.TEMPLATES)
    assert [lesson["difficulty"] for lesson in lessons] == sorted(lesson["difficulty"] for lesson in lessons)
    for lesson in lessons:
        assert lesson["summary"] and lesson["mistakes"] and len(lesson["steps"]) >= 4
        assert all(s["when"] != "Hinweis" for s in lesson["steps"])
        assert any(s["bar_from"] for s in lesson["steps"]) and any(s["controls"] for s in lesson["steps"])
        assert "Track B" in lesson["steps"][0]["text"]


def test_fixed_sort_orders_and_tempo_plausibility():
    from settracker.music import tempo_check

    tracks = [_t(1, 128, "9A", 0.8, 0.5), _t(2, 120, "2B", 0.3, 0.5), _t(3, None, None, None, None), _t(4, 124, "2A", 0.5, 0.5)]
    assert review.sorted_order(tracks, "bpm") == [1, 3, 0, 2]          # ohne Wert ans Ende
    assert review.sorted_order(tracks, "energy") == [1, 3, 0, 2]
    assert review.sorted_order(tracks, "key") == [3, 1, 0, 2]          # 2A, 2B, 9A
    assert review.sorted_order(tracks, "bpm", pinned={0}) == [0, 1, 3, 2]
    r = review.review(tracks, [], order_by="bpm")
    assert [t for t in r["order"]] == [2, 4, 1, 3] and r["recommend_rebuild"]

    assert tempo_check(124, "House") is None and tempo_check(124, "") is None
    assert tempo_check(87, "Drum & Bass")["suggest"] == 174
    assert tempo_check(248, "House")["suggest"] == 124
    odd = tempo_check(106.56, "Drum & Bass")
    assert odd["suggest"] is None and "160–182" in odd["text"]
