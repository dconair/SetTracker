import pytest

from settracker import db, demo, library


@pytest.fixture(scope="session")
def demo_dir(tmp_path_factory):
    folder = tmp_path_factory.mktemp("demo")
    demo.write_demo_library(folder)
    return folder


@pytest.fixture(scope="session")
def lib(tmp_path_factory, demo_dir):
    """Analysierte Demo-Bibliothek in einer temporären Datenbank."""
    db.set_path(tmp_path_factory.mktemp("db") / "test.db")
    result = library.scan_folder(str(demo_dir))
    library.wait_idle()
    tracks = {t["title"]: t for t in db.get_tracks(result["track_ids"])}
    assert all(t["status"] == "done" for t in tracks.values()), [t["error"] for t in tracks.values()]
    return tracks
