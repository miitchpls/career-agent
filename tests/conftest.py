import pytest

from career_agent import db, fx, geo


@pytest.fixture(autouse=True)
def tmp_db(tmp_path, monkeypatch):
    """Every test gets its own SQLite file; the real data/jobs.db is never touched."""
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "jobs.db")
    db.init()
    return db.DB_PATH


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
