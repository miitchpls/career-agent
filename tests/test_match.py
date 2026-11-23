from datetime import date, timedelta

from fastapi.testclient import TestClient

from career_agent import db
from career_agent.app import app
from career_agent.query import Place, Query, Scope, match

client = TestClient(app)

LUGANO = Place(city="Lugano", country="ch", geo_id=1)
TORONTO = Place(city="Toronto", country="ca", geo_id=2)
RATES = {"CHF": 1.0, "EUR": 1.0, "CAD": 1.5}
JOB = {
    "url": "u",
    "work_mode": "hybrid",
    "min_amount": 80_000,
    "max_amount": 95_000,
    "currency": "CHF",
    "job_type": ",fulltime,",
    "date_posted": date.today().isoformat(),
}


def states(q, job=JOB, hits=("geo:1",)):
    return {c["kind"]: c["state"] for c in match(q, job, list(hits), RATES)}


def test_only_the_conditions_the_search_sets():
    assert match(Query(), JOB, [], RATES) == []
    assert states(Query(scopes=[Scope(anywhere=True)])) == {}


def test_place_and_mode_follow_the_matching_group():
    q = Query(
        scopes=[
            Scope(places=[LUGANO], modes=["hybrid"]),
            Scope(places=[TORONTO], modes=["remote"]),
        ]
    )
    assert states(q) == {"place": "ok", "mode": "ok"}
    # Found in Toronto: that group wants remote.
    assert states(q, hits=["geo:2"]) == {"place": "ok", "mode": "no"}
    assert states(q, JOB | {"work_mode": "unknown"}) == {
        "place": "ok",
        "mode": "unknown",
    }
    assert states(q, hits=["geo:9"]) == {"place": "no"}
    # A group with any mode: nothing to check on the mode.
    q = Query(scopes=[Scope(places=[LUGANO])])
    assert states(q) == {"place": "ok"}
    assert match(q, JOB, ["geo:1"], RATES)[0]["value"] == "Lugano"


def test_without_a_place_of_its_own_the_place_is_unknown():
    q = Query(
        scopes=[
            Scope(places=[LUGANO], modes=["hybrid"]),
            Scope(places=[TORONTO], modes=["remote"]),
        ]
    )
    # Opened from a link, or found only by an "anywhere" search: every group may apply.
    assert states(q, hits=["link"]) == {"place": "unknown", "mode": "ok"}
    assert states(q, hits=["*"]) == {"place": "unknown", "mode": "ok"}


def test_salary_uses_the_top_of_the_range_in_the_searchs_currency():
    q = Query(salary_min=90, salary_currency="CHF")
    assert states(q) == {"salary": "ok"}  # 95k ≥ 90k
    assert states(q, JOB | {"max_amount": None}) == {"salary": "no"}  # 80k
    assert states(q, JOB | {"min_amount": None, "max_amount": None}) == {
        "salary": "unknown"
    }
    (c,) = match(Query(salary_min=90, salary_currency="CAD"), JOB, [], RATES)
    assert c["value"] == 142_500 and c["expected"] == 90_000 and c["currency"] == "CAD"


def test_job_type_and_age():
    q = Query(job_types=["contract"], posted_within=24)
    assert states(q) == {"job_type": "no", "posted": "ok"}
    old = (date.today() - timedelta(days=10)).isoformat()
    assert states(q, JOB | {"job_type": None, "date_posted": old}) == {
        "job_type": "unknown",
        "posted": "no",
    }


def test_the_endpoint_reads_the_saved_posting_and_its_hits():
    db.save_many(
        [
            {
                "url": "u",
                "site": "linkedin",
                "title": "Go",
                "work_mode": "remote",
                "description": "x",
            }
        ],
        "geo:1",
        "Lugano",
        "go",
    )
    q = Query(scopes=[Scope(places=[LUGANO], modes=["hybrid"])], salary_min=90)
    r = client.post("/api/jobs/match", json={"url": "u", "query": q.model_dump()})
    assert [(c["kind"], c["state"]) for c in r.json()["checks"]] == [
        ("place", "ok"),
        ("mode", "no"),
        ("salary", "unknown"),
    ]
    assert (
        client.post("/api/jobs/match", json={"url": "nope", "query": {}}).status_code
        == 404
    )
