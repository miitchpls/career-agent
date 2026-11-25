import pytest

from career_agent.query import BoardPlace, Place, Query, passes, plan


def q(**kw) -> Query:
    return Query.model_validate(kw)


ZURICH = {"city": "Zurigo", "country": "ch"}


def test_geo_place_matches_both_its_id_and_legacy_key():
    p = Place(city="Naples", country="us", region="Florida", geo_id=4165565)
    assert p.keys == ["geo:4165565", "naples|us"]


def test_plan_requires_where_and_title():
    _, _, errors = plan(Query())
    assert len(errors) == 2


def test_plan_expands_and_skips_indeed_when_anywhere():
    queries, skipped, errors = plan(
        q(
            scopes=[{"places": [ZURICH]}, {"anywhere": True, "modes": ["remote"]}],
            title_any=["python", "go"],
        )
    )
    assert not errors
    assert [(x.site, x.place_label) for x in queries[:2]] == [
        ("linkedin", "Zurigo, CH"),
        ("indeed", "Zurigo, CH"),
    ]
    assert len(queries) == 6 and len(skipped) == 2
    assert all(x.remote_only for x in queries if x.place is None)


def test_plan_resolves_board_names_from_exonyms_when_offline():
    (pq, *_), _, _ = plan(q(scopes=[{"places": [ZURICH]}], title_any=["python"]))
    assert pq.board == BoardPlace("Zurich", None, "Switzerland", "switzerland")


def test_board_place_match_rejects_only_explicit_elsewhere():
    milan = BoardPlace("Milan", "Lombardy", "Italy", "italy")
    assert milan.matches("Milan, Lombardy, Italy")
    assert milan.matches("Greater Milan Metropolitan Area")
    assert milan.matches("Italy")
    assert not milan.matches("Milano, TX")
    assert not milan.matches("Bastrop, TX, USA")


def test_phrases_are_trimmed_lowercased_and_deduped():
    assert q(title_any=[" Python ", "python", ""]).title_any == ["python"]


def test_remote_only_ignores_the_include_unknown_flag():
    queries, _, _ = plan(
        q(scopes=[{"anywhere": True, "modes": ["remote", "unknown"]}], title_any=["go"])
    )
    assert [x.remote_only for x in queries] == [True]


def test_salary_is_compared_in_the_filter_currency():
    from career_agent import fx

    assert fx.convert(90_000, "CHF", "EUR", fx.FALLBACK) == pytest.approx(
        97_466, rel=1e-3
    )
    assert fx.convert(1, "XXX", "EUR", fx.FALLBACK) is None
    assert q(salary_min=80, salary_currency="CHF").salary_currency == "CHF"


def test_a_single_job_type_is_passed_to_indeed_only():
    one, _, _ = plan(
        q(scopes=[{"places": [ZURICH]}], title_any=["python"], job_types=["internship"])
    )
    assert [(x.site, x.job_type) for x in one] == [
        ("linkedin", None),
        ("indeed", "internship"),
    ]
    assert one[1].fingerprint(None).endswith("|internship")
    many, _, _ = plan(
        q(
            scopes=[{"places": [ZURICH]}],
            title_any=["python"],
            job_types=["fulltime", "parttime"],
        )
    )
    assert all(x.job_type is None for x in many)  # several types: filtered locally


def test_salary_currency_defaults_to_chf():
    assert Query().salary_currency == "CHF"


def test_title_matches_every_word_of_a_phrase():
    from career_agent.query import title_matches

    q = Query.model_validate(
        {"title_any": ["python developer", "data"], "title_none": ["senior"]}
    )
    assert title_matches(q, "Developer (Python)")  # every word, any order
    assert title_matches(q, "Big Data Engineer")
    assert not title_matches(q, "Python Engineer")
    assert not title_matches(q, "Senior Data Engineer")
    assert title_matches(Query(), "anything")


def test_korea_is_searched_on_indeed_too():
    # From the offline catalogue: no GeoNames id, so the country table decides.
    seoul = Place(city="Seul", country="kr")
    board = seoul.board()
    assert (board.city, board.country, board.indeed_country) == (
        "Seoul",
        "South Korea",
        "south korea",
    )
    assert board.matches("Gangnam-gu, Seoul, South Korea")
    assert not board.matches("Seoul, TX, United States")
    searches, _, errors = plan(
        q(scopes=[{"places": [seoul.model_dump()]}], title_any=["backend"])
    )
    assert not errors
    assert {s.site for s in searches} == {"linkedin", "indeed"}


ROW = {
    "url": "u",
    "title": "Python developer",
    "company": "Acme",
    "description": "",
    "work_mode": "unknown",
    "job_type": None,
    "date_posted": None,
    "min_amount": None,
    "max_amount": None,
    "currency": None,
}
STRICT = {
    "scopes": [{"places": [ZURICH], "modes": ["hybrid"]}],
    "title_any": ["python"],
    "salary_min": 80,
    "salary_unknown": False,
    "job_types": ["fulltime"],
    "job_type_unknown": False,
}


def test_what_a_list_card_doesnt_say_cant_exclude_it():
    """A LinkedIn card has no salary, type or text: unknown passes until it's opened."""
    keys = ["zurigo|ch"]
    assert passes(q(**STRICT), ROW, keys, {}, detailed=False)
    assert not passes(q(**STRICT), ROW, keys, {}, detailed=True)


def test_what_a_posting_says_against_the_filters_excludes_it():
    keys = ["zurigo|ch"]
    remote = ROW | {"work_mode": "remote"}
    assert not passes(q(**STRICT), remote, keys, {}, detailed=False)
    known = ROW | {
        "work_mode": "hybrid",
        "job_type": ",fulltime,",
        "max_amount": 90_000,
        "currency": "CHF",
    }
    assert passes(q(**STRICT), known, keys, {"CHF": 1.0}, detailed=True)
    cheap = known | {"max_amount": 60_000}
    assert not passes(q(**STRICT), cheap, keys, {"CHF": 1.0}, detailed=True)


def test_title_and_free_text_filter_the_results():
    query = q(title_any=["python"], title_none=["senior"], search="acme")
    assert passes(query, ROW, [], {}, detailed=False)
    assert not passes(query, ROW | {"title": "Senior Python dev"}, [], {}, False)
    assert not passes(query, ROW | {"company": "Beta"}, [], {}, detailed=False)
