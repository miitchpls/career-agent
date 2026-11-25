import pytest

from career_agent import ai, boards, db, feed, fx, geo, scraper


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    """Every test gets its own SQLite file; the real data/jobs.db is never touched."""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "jobs.db")
    db.init()
    return db.DB_PATH


@pytest.fixture(autouse=True)
def empty_feed(monkeypatch):
    """Every test starts with no cached search, and the boards' memory reset."""
    feed.clear()
    monkeypatch.setattr(boards, "_empty_pages", [])
    monkeypatch.setattr(boards, "_indeed_by_date", True)
    monkeypatch.setattr(scraper, "_last_request", {})
    monkeypatch.setattr(boards, "INDEED_RETRY_PAUSE", 0)
    # No real pauses between requests (the test of the pacing sets its own).
    monkeypatch.setattr(
        scraper, "REQUEST_PAUSE", {"linkedin": (0, 0), "indeed": (0, 0)}
    )
    yield
    feed.clear()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Tests never call Open-Meteo, the ECB or the job boards."""

    def offline(*_a, **_k):
        raise OSError("network disabled in tests")

    monkeypatch.setattr(geo, "_get", offline)
    monkeypatch.setattr(fx, "_fetch", offline)  # exchange rates: bundled snapshot
    monkeypatch.setattr(fx, "_cache", None)
    monkeypatch.setattr(fx, "_failed_at", float("-inf"))
    geo._search_online.cache_clear()
    monkeypatch.setattr(geo, "_english", {})
    monkeypatch.setattr(geo, "_failed", {})


@pytest.fixture(autouse=True)
def no_ai_cli(monkeypatch):
    """Tests never run the user's AI CLIs (they would spend the user's subscription)."""
    monkeypatch.setattr(ai, "detect", list)

    def refuse(*_a, **_k):
        raise AssertionError("a test tried to run an AI CLI")

    monkeypatch.setattr(ai, "_communicate", refuse)
    monkeypatch.setattr(ai, "_quick", refuse)


@pytest.fixture(autouse=True)
def no_board_pages(monkeypatch):
    """Tests never open a job board's page: a session built for one refuses to send."""

    class Refusing:
        def __init__(self, *_a, **_k):
            self.hooks = {"response": []}
            self.headers = {}

        def get(self, *_a, **_k):
            raise AssertionError("a test tried to open a job board page")

        post = get

    monkeypatch.setattr(boards, "RequestsRotating", Refusing)
