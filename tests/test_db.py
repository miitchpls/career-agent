import sqlite3

from career_agent import db
from career_agent.query import Query


def job(url: str, **kw) -> dict:
    return {
        "url": url,
        "site": "linkedin",
        "title": "Python developer",
        "work_mode": "remote",
        **kw,
    }


def test_an_opened_posting_is_stored_once():
    assert db.save_job(job("a")) is True
    assert db.save_job(job("a", title="Changed")) is False
    assert db.get_job("a")["title"] == "Python developer"
    assert db.job_places("a") == []
    db.save_job(job("a"), ["geo:1", "*"])
    assert db.job_places("a") == ["*", "geo:1"]
    assert db.count_opened(["a", "b"]) == 1
    item = db.opened(["a", "b"], "CHF", {})["a"]
    assert item["opened"] and item["score"] is None and item["has_cv"] is False


def test_migration_keeps_only_the_postings_the_user_opened(tmp_db):
    """v12 drops what searches stored but the user never opened, after copying the file."""
    tmp_db.unlink()
    c = sqlite3.connect(tmp_db)
    c.executescript(
        """
        CREATE TABLE jobs (url TEXT PRIMARY KEY, site TEXT NOT NULL, title TEXT NOT NULL, company TEXT,
          location TEXT, work_mode TEXT NOT NULL, date_posted TEXT, min_amount REAL, max_amount REAL,
          currency TEXT, description TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
        CREATE TABLE hits (url TEXT NOT NULL, place TEXT NOT NULL, keyword TEXT NOT NULL, seen_at TEXT NOT NULL,
          PRIMARY KEY (url, place, keyword));
        INSERT INTO jobs VALUES ('found', 'linkedin', 'Dev', NULL, NULL, 'hybrid', NULL, NULL, NULL, NULL, '', 't', 't');
        INSERT INTO jobs VALUES ('pasted', 'linkedin', 'Dev', NULL, NULL, 'hybrid', NULL, NULL, NULL, NULL, 'x', 't', 't');
        INSERT INTO hits VALUES ('found', 'zurigo|ch', 'dev', 't');
        INSERT INTO hits VALUES ('pasted', 'link', '', 't');
        INSERT INTO hits VALUES ('pasted', 'geo:7', 'dev', 't');
        PRAGMA user_version = 2;
        """
    )
    c.close()
    db.init()
    assert db.get_job("found") is None and db.get_job("pasted") is not None
    assert db.job_places("pasted") == ["geo:7"]  # where it was found outlives `hits`
    conn = sqlite3.connect(tmp_db)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master")}
    assert "hits" not in tables and "board_searches" not in tables
    assert conn.execute("PRAGMA user_version").fetchone()[0] == db.SCHEMA_VERSION
    backup = sqlite3.connect(tmp_db.with_name("jobs.before-v12.db"))
    assert backup.execute("SELECT count(*) FROM jobs").fetchone()[0] == 2
    db.init()  # running again changes nothing
    assert db.get_job("pasted") is not None


def test_saved_search_names_are_case_insensitive():
    q = Query.model_validate({"title_any": ["python"]})
    first, created = db.save_search("Milano python", q)
    again, created_again = db.save_search("milano python", q)
    assert created and not created_again and first["id"] == again["id"]
    assert [s["name"] for s in db.list_saved()] == ["milano python"]
