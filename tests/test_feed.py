from career_agent import db, feed
from career_agent.query import Query, plan

ZURICH = {"city": "Zurigo", "country": "ch"}
BASEL = {"city": "Basilea", "country": "ch"}


def job(url, date=None, **kw):
    return {
        "url": url,
        "site": "linkedin",
        "title": "Python dev",
        "company": "Acme",
        "location": "Zurich",
        "work_mode": "unknown",
        "job_type": None,
        "date_posted": date,
        "min_amount": None,
        "max_amount": None,
        "currency": None,
        "description": None,
        **kw,
    }


def searches(order="relevant", **kw):
    q = Query.model_validate(
        {
            "scopes": [{"places": [ZURICH, BASEL]}],
            "title_any": ["python"],
            "sites": ["linkedin"],
            **kw,
        }
    )
    queries, _, _ = plan(q)
    return q, queries


def load(q, pq, order, *pages):
    for i, jobs in enumerate(pages):
        feed.add_page(feed.key(pq, q, order), pq, order, jobs, set(), 1, i == 0)


def urls(view):
    return [i["url"] for i in view["items"]]


def test_by_relevance_the_searches_take_turns_page_by_page():
    q, (zh, bs) = searches()
    load(q, zh, "relevant", [job("z1"), job("z2")], [job("z3")])
    load(q, bs, "relevant", [job("b1"), job("b2"), job("b3")])
    # Page 1 of both, alternating, then page 2: what was shown never moves.
    assert urls(feed.view(q, "relevant")) == ["z1", "b1", "z2", "b2", "b3", "z3"]


def test_newest_first_sorts_each_page_by_date():
    q, (zh, bs) = searches()
    load(q, zh, "recent", [job("z1", "2026-11-20"), job("z2", None)])
    load(q, bs, "recent", [job("b1", "2026-11-24")])
    assert urls(feed.view(q, "recent")) == ["b1", "z1", "z2"]
    assert feed.view(q, "relevant")["missing"] == 2  # the other order isn't cached


def test_a_posting_found_twice_shows_once_with_both_places():
    q, (zh, bs) = searches()
    load(q, zh, "relevant", [job("same")])
    load(q, bs, "relevant", [job("same"), job("b1")])
    view = feed.view(q, "relevant")
    assert urls(view) == ["same", "b1"] and view["loaded"] == 2
    assert [h["label"] for h in view["items"][0]["hits"]] == ["Zurigo", "Basilea"]
    assert feed.places("same") == sorted({zh.place_key, bs.place_key})


def test_an_opened_posting_shows_what_was_read_from_its_page():
    q, (zh, _) = searches()
    load(q, zh, "relevant", [job("z1"), job("z2")])
    db.save_job(job("z1", description="Go and Python", work_mode="hybrid"))
    a, b = feed.view(q, "relevant")["items"]
    assert (a["opened"], a["description"], a["work_mode"]) == (
        True,
        "Go and Python",
        "hybrid",
    )
    assert a["hits"][0]["label"] == "Zurigo"
    assert (b["opened"], b["description"]) == (False, None)


def test_filters_apply_to_what_was_loaded():
    q, (zh, _) = searches()
    load(q, zh, "relevant", [job("z1"), job("z2", title="Senior Python dev")])
    strict, _ = searches(title_none=["senior"])
    view = feed.view(strict, "relevant")
    assert urls(view) == ["z1"] and view["loaded"] == 2


def test_more_is_offered_while_a_search_has_pages_left():
    q, (zh, bs) = searches()
    feed.add_page(
        feed.key(zh, q, "relevant"), zh, "relevant", [job("z1")], set(), None, True
    )
    view = feed.view(q, "relevant")
    assert (view["more"], view["missing"]) == (False, 1)
    feed.add_page(
        feed.key(bs, q, "relevant"), bs, "relevant", [job("b1")], set(), 10, True
    )
    assert feed.view(q, "relevant")["more"] is True


def test_a_query_without_place_or_title_shows_nothing():
    view = feed.view(Query(), "relevant")
    assert view["items"] == [] and view["searches"] == 0


def test_a_cached_posting_with_its_text_is_found_by_url():
    q, (zh, _) = searches()
    feed.add_page(
        feed.key(zh, q, "relevant"), zh, "relevant", [job("z1")], {"z1"}, None, True
    )
    assert feed.cached("z1") == (job("z1"), True)
    assert feed.cached("nope") is None


def test_a_later_page_for_an_expired_search_is_dropped():
    from datetime import UTC, datetime

    q, (zh, _) = searches()
    k = feed.key(zh, q, "relevant")
    feed.add_page(k, zh, "relevant", [job("z1")], set(), 10, True)
    feed._streams[k].started = datetime(2000, 1, 1, tzinfo=UTC)
    assert feed.add_page(k, zh, "relevant", [job("z11")], set(), 20, False) is None
    assert feed.get(k) is None  # page 2 never became a search of its own


def test_an_opened_card_that_misses_the_filters_stays_with_the_reasons():
    """A LinkedIn card showed because it states no salary; its page states none either."""
    q, (zh, _) = searches(salary_min=45, salary_currency="EUR", salary_unknown=False)
    load(q, zh, "relevant", [job("z1"), job("z2")])
    db.save_job(job("z1", description="Python, nessuno stipendio indicato"))
    db.save_job(job("z2", description="Python", max_amount=60_000.0, currency="EUR"))
    a, b = feed.view(q, "relevant")["items"]
    assert (a["url"], a["opened"], a["unmet"]) == ("z1", True, ["salary"])
    assert (b["url"], b["unmet"]) == ("z2", [])
    low = job("z3", description="Python", max_amount=30_000.0, currency="EUR")
    load(q, zh, "relevant", [job("z3")])
    db.save_job(low)
    (c,) = feed.view(q, "relevant")["items"]
    assert c["unmet"] == ["salary"]  # below the floor: flagged, not hidden


def test_a_card_the_filters_exclude_by_what_it_says_stays_hidden():
    q, (zh,) = searches(scopes=[{"places": [ZURICH], "modes": ["hybrid"]}])
    load(q, zh, "relevant", [job("z1", work_mode="remote")])
    db.save_job(job("z1", work_mode="remote", description="Remote"))
    assert feed.view(q, "relevant")["items"] == []
