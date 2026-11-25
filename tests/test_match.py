from datetime import date, timedelta

from fastapi.testclient import TestClient

from career_agent import db, feed
from career_agent.app import app
from career_agent.query import Place, Query, Scope, match, plan

client = TestClient(app)

BASEL = Place(city="Basel", country="ch", geo_id=1)
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
            Scope(places=[BASEL], modes=["hybrid"]),
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
    q = Query(scopes=[Scope(places=[BASEL])])
    assert states(q) == {"place": "ok"}
    assert match(q, JOB, ["geo:1"], RATES)[0]["value"] == "Basel"


def test_without_a_place_of_its_own_the_place_is_unknown():
    q = Query(
        scopes=[
            Scope(places=[BASEL], modes=["hybrid"]),
            Scope(places=[TORONTO], modes=["remote"]),
        ]
    )
    # Found by no search we know of (opened from a link): every group may apply.
    assert states(q, hits=[]) == {"place": "unknown", "mode": "ok"}
    # Found only by an "anywhere" search: none of these groups is known to apply.
    assert states(q, hits=["*"]) == {"place": "unknown"}


def test_found_anywhere_only_the_groups_without_places_apply():
    q = Query(scopes=[Scope(places=[BASEL]), Scope(anywhere=True, modes=["remote"])])
    # An on-site job an "anywhere, remote" search returned: not in Basel, not remote.
    onsite = JOB | {"work_mode": "onsite"}
    assert states(q, onsite, hits=["*"]) == {"place": "unknown", "mode": "no"}
    assert states(q, JOB | {"work_mode": "remote"}, hits=["*"])["mode"] == "ok"


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


def test_the_endpoint_reads_the_saved_posting_and_where_searches_found_it():
    posting = {
        "url": "u",
        "site": "linkedin",
        "title": "Go",
        "work_mode": "remote",
        "description": "x",
    }
    db.save_job(posting)
    q = Query(
        scopes=[Scope(places=[BASEL], modes=["hybrid"])],
        title_any=["go"],
        salary_min=90,
        sites=["linkedin"],
    )
    (pq,), _, _ = plan(q)
    feed.add_page(
        feed.key(pq, q, "relevant"), pq, "relevant", [posting], set(), None, True
    )
    r = client.post("/api/jobs/match", json={"url": "u", "query": q.model_dump()})
    checks = [("place", "ok"), ("mode", "no"), ("salary", "unknown")]
    assert [(c["kind"], c["state"]) for c in r.json()["checks"]] == checks
    # Once the search expires, the places stored when it was opened still answer.
    db.save_job(posting, feed.places("u"))
    feed.clear()
    r = client.post("/api/jobs/match", json={"url": "u", "query": q.model_dump()})
    assert [(c["kind"], c["state"]) for c in r.json()["checks"]] == checks
    assert (
        client.post("/api/jobs/match", json={"url": "nope", "query": {}}).status_code
        == 404
    )
