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


def test_save_many_counts_only_new_jobs_and_records_hits():
    assert (
        db.save_many([job("a"), job("b"), job("a")], "geo:1", "Zurigo", "python") == 2
    )
    assert db.save_many([job("a")], "*", "Ovunque", "python") == 0
    (a,) = [j for j in db.search(Query(), "posted", 0, 10)["items"] if j["url"] == "a"]
    assert sorted(h["label"] for h in a["hits"]) == ["Ovunque", "Zurigo"]


def test_pagination_is_pinned_to_the_first_page_snapshot():
    db.save_many([job(u) for u in "abc"], "*", "Ovunque", "python")
    first = db.search(Query(), "posted", 0, 2)
    db.save_many(
        [job("d"), job("e")], "*", "Ovunque", "python"
    )  # a running search inserts rows
    second = db.search(Query(), "posted", 2, 2, first["as_of"])
    urls = [j["url"] for j in first["items"] + second["items"]]
    assert sorted(urls) == ["a", "b", "c"]
    assert first["total"] == second["total"] == 3


def test_migration_from_v2_keeps_data_and_adds_hit_labels(tmp_db):
    tmp_db.unlink()
    c = sqlite3.connect(tmp_db)
    c.executescript(
        """
        CREATE TABLE jobs (url TEXT PRIMARY KEY, site TEXT NOT NULL, title TEXT NOT NULL, company TEXT,
          location TEXT, work_mode TEXT NOT NULL, date_posted TEXT, min_amount REAL, max_amount REAL,
          currency TEXT, description TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
        CREATE TABLE hits (url TEXT NOT NULL, place TEXT NOT NULL, keyword TEXT NOT NULL, seen_at TEXT NOT NULL,
          PRIMARY KEY (url, place, keyword));
        INSERT INTO jobs VALUES ('u', 'linkedin', 'Dev', NULL, NULL, 'hybrid', NULL, NULL, NULL, NULL, '', 't', 't');
        INSERT INTO hits VALUES ('u', 'zurigo|ch', 'dev', 't');
        PRAGMA user_version = 2;
        """
    )
    c.close()
    db.init()
    page = db.search(Query(), "posted", 0, 10)
    assert page["overall"] == 1
    assert page["items"][0]["hits"] == [
        {"place": "zurigo|ch", "label": None, "keyword": "dev"}
    ]
    assert (
        sqlite3.connect(tmp_db).execute("PRAGMA user_version").fetchone()[0]
        == db.SCHEMA_VERSION
    )


def test_saved_search_names_are_case_insensitive():
    q = Query.model_validate({"title_any": ["python"]})
    first, created = db.save_search("Milano python", q)
    again, created_again = db.save_search("milano python", q)
    assert created and not created_again and first["id"] == again["id"]
    assert [s["name"] for s in db.list_saved()] == ["milano python"]


def test_sort_direction_keeps_missing_values_last():
    db.save_many(
        [
            job("cheap", min_amount=50_000.0, currency="EUR"),
            job("rich", max_amount=150_000.0, currency="EUR"),
            job("unknown"),
        ],
        "*",
        "Ovunque",
        "python",
    )
    urls = lambda d: [
        j["url"] for j in db.search(Query(), "salary", 0, 10, direction=d)["items"]
    ]
    assert urls("desc") == ["rich", "cheap", "unknown"]
    assert urls("asc") == ["cheap", "rich", "unknown"]


def test_salary_filter_and_sort_compare_across_currencies():
    db.save_many(
        [
            job("chf", max_amount=90_000.0, currency="CHF"),  # ~97K EUR
            job("inr", max_amount=3_200_000.0, currency="INR"),  # ~31K EUR
            job("eur", max_amount=85_000.0, currency="EUR"),
            job("odd", max_amount=90_000.0, currency="XXX"),  # unknown currency
        ],
        "*",
        "Ovunque",
        "python",
    )
    q = Query.model_validate(
        {"salary_min": 80, "salary_currency": "EUR", "salary_unknown": False}
    )
    page = db.search(q, "salary", 0, 10)
    assert [j["url"] for j in page["items"]] == ["chf", "eur"]
    chf = page["items"][0]["salary_converted"]
    assert chf["currency"] == "EUR" and 96_000 < chf["max"] < 98_000
    assert page["items"][1]["salary_converted"] is None  # already in EUR

    in_chf = db.search(q.model_copy(update={"salary_currency": "CHF"}), "salary", 0, 10)
    assert [j["url"] for j in in_chf["items"]] == ["chf"]  # 85K EUR is ~78K CHF

    with_unknown = db.search(
        q.model_copy(update={"salary_unknown": True}), "salary", 0, 10
    )
    assert [j["url"] for j in with_unknown["items"]] == [
        "chf",
        "eur",
        "odd",
    ]  # unconvertible ~ unstated


def test_job_type_filter_matches_whole_tokens_and_unknowns():
    db.save_many(
        [
            job("ft", job_type=",fulltime,"),
            job("both", job_type=",parttime,contract,"),
            job("intern", job_type=",internship,"),
            job("unknown"),
        ],
        "*",
        "Ovunque",
        "python",
    )
    urls = lambda **kw: sorted(
        j["url"] for j in db.search(Query.model_validate(kw), "posted", 0, 10)["items"]
    )
    assert urls(job_types=["parttime"], job_type_unknown=False) == ["both"]
    assert urls(job_types=["fulltime", "internship"], job_type_unknown=False) == [
        "ft",
        "intern",
    ]
    assert urls(job_types=["fulltime"]) == ["ft", "unknown"]
