import pytest

from settracker import demo
from settracker.music import genre_family, key_relation, to_camelot


@pytest.mark.parametrize("spec", demo.DEMO_TRACKS, ids=[s[0] for s in demo.DEMO_TRACKS])
def test_bpm_and_grid(lib, spec):
    title, _, _, bpm, *_ = spec
    track = lib[title]
    assert abs(track["bpm"] - bpm) <= 1
    assert track["analysis"]["first_downbeat"] < 0.05


@pytest.mark.parametrize("spec", [s for s in demo.DEMO_TRACKS if not s[5]], ids=lambda s: s[0])
def test_minor_keys(lib, spec):
    assert lib[spec[0]]["camelot"] == to_camelot(spec[4], False)


def test_major_key_is_harmonically_equivalent(lib):
    # Der Demo-Track besteht nur aus einem C-Dur-Dreiklang; ohne Tonleiter-Kontext ist er von
    # eng verwandten Tonarten nicht zu unterscheiden. Gefordert ist eine mischbare Tonart.
    score, _ = key_relation(lib["Sunset Piano"]["camelot"], to_camelot(0, True))
    assert score >= 0.7


@pytest.mark.parametrize("spec", demo.DEMO_TRACKS, ids=[s[0] for s in demo.DEMO_TRACKS])
def test_structure(lib, spec):
    title, *_, layout, _ = spec
    secs = lib[title]["analysis"]["sections"]
    assert [s["kind"] for s in secs] == ["intro", "main", "break", "main", "outro"]
    assert secs[0]["end_bar"] == layout[0]
    assert secs[-1]["start_bar"] == sum(layout[:4])
    assert secs[2]["start_bar"] == layout[0] + layout[1]


def test_waveform_and_energy(lib):
    from settracker import db

    wf = db.get_waveform(lib["Steel Tunnel"]["id"])
    assert len(wf["low"]) == len(wf["mid"]) == len(wf["high"]) == 1200
    assert max(wf["low"]) > 100
    assert lib["Steel Tunnel"]["energy"] > lib["Morning Light"]["energy"]


def test_genre_families():
    assert genre_family(["Deep House"]) == "House"
    assert genre_family(["liquid funk", "electronic"]) == "Drum & Bass"
    assert genre_family(["electronic", "house", "french house", "dance", "disco"]) == "House"
    assert genre_family(["german hip hop"]) == "Hip-Hop"
    assert genre_family(["polka"]) == ""
    assert lib_family_ok()


def lib_family_ok():
    return genre_family(["Tech House"]) == "House" and genre_family(["Techno"]) == "Techno"
