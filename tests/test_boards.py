from datetime import date
from types import SimpleNamespace

import requests
from jobspy.model import CompensationInterval, JobPost

from career_agent import boards


class Response:
    def __init__(
        self, text="", status=200, url="https://www.linkedin.com/x", body=None
    ):
        self.text, self.status_code, self.url, self.body = text, status, url, body

    def json(self):
        return self.body


def fake_board(monkeypatch, *responses):
    """Sessions that answer with `responses` in turn; returns what was sent."""
    left, sent = list(responses), []

    class Session:
        def __init__(self, *_a, **_k):
            self.hooks, self.headers = {"response": []}, {}

        def _answer(self, record):
            sent.append(record)
            response = left.pop(0)
            for hook in self.hooks["response"]:
                hook(response)
            return response

        def get(self, url, params=None, **_k):
            return self._answer({"url": url, "params": params or {}})

        def post(self, url, json=None, **_k):
            return self._answer({"url": url, "query": json["query"]})

    monkeypatch.setattr(boards, "RequestsRotating", Session)
    return sent


def cards(first: int, n: int) -> str:
    return "".join(
        f"""<div class="base-search-card" data-entity-urn="urn:li:jobPosting:{i}">
          <h3 class="base-search-card__title">Python dev {i}</h3>
          <h4 class="base-search-card__subtitle"><a href="https://ch.linkedin.com/company/a">Acme</a></h4>
          <span class="job-search-card__location">Zurich, Zurich, Switzerland</span>
          <time datetime="2026-11-20"></time></div>"""
        for i in range(first, first + n)
    )


ARGS = {"search_term": "python", "location": "Zurich, Switzerland"}


def test_a_linkedin_page_is_one_request_sorted_as_asked(monkeypatch):
    sent = fake_board(monkeypatch, Response(cards(0, 10)), Response(cards(10, 10)))
    first = boards.page("linkedin", ARGS, "relevant", None)
    assert first.requests == 1 and len(first.rows) == 10 and first.next == 10
    assert first.rows[0]["job_url"] == "https://www.linkedin.com/jobs/view/0"
    assert not first.detailed  # a list card has no text: it's read when opened
    second = boards.page("linkedin", ARGS, "recent", first.next)
    assert [r["params"]["sortBy"] for r in sent] == ["R", "DD"]
    assert [r["params"]["start"] for r in sent] == [0, 10]
    assert second.rows[0]["title"] == "Python dev 10"


def test_a_short_or_empty_linkedin_page_is_the_end(monkeypatch):
    from jobspy.linkedin.constant import empty_page

    fake_board(monkeypatch, Response(cards(0, 4)), Response(empty_page))
    short = boards.page("linkedin", ARGS, "relevant", None)
    assert len(short.rows) == 4 and short.next is None
    empty = boards.page("linkedin", ARGS, "relevant", 10)
    assert empty.rows == [] and empty.next is None and not empty.blocked


def test_linkedin_throttling_is_a_block(monkeypatch):
    fake_board(
        monkeypatch,
        Response("<html>login</html>"),
        Response("", status=999),
        Response("", url="https://www.linkedin.com/authwall?trk=x"),
    )
    odd = boards.page("linkedin", ARGS, "relevant", None)
    assert odd.blocked and odd.rows == [] and "blocked" in odd.error
    assert boards.page("linkedin", ARGS, "relevant", None).blocked
    assert boards.page("linkedin", ARGS, "relevant", None).blocked


INDEED_ARGS = {"search_term": "python", "location": "Milano", "country_indeed": "italy"}
INDEED_JOB = {
    "key": "fedcba9876543210",
    "title": "Data Engineer",
    "sourceEmployerName": "Gamma",
    "dateOnIndeed": 1763600000000,
    "description": {"html": "<p>Spark e Python.</p>"},
    "location": {"countryCode": "IT", "admin1Code": "PIE", "city": "Torino"},
    "compensation": {"estimated": None, "baseSalary": None, "currencyCode": None},
    "attributes": [],
    "employer": None,
    "recruit": {"viewJobUrl": None},
}


def indeed_page(cursor="c2", jobs=(INDEED_JOB,)):
    body = {
        "data": {
            "jobSearch": {
                "pageInfo": {"nextCursor": cursor},
                "results": [{"job": j} for j in jobs],
            }
        }
    }
    return Response(url="https://apis.indeed.com/graphql", body=body)


REFUSED = Response(
    url="https://apis.indeed.com/graphql",
    body={"errors": [{"message": 'Value "DATE" does not exist in enum'}]},
)


def test_an_indeed_page_brings_the_text_and_the_next_cursor(monkeypatch):
    sent = fake_board(monkeypatch, indeed_page(), indeed_page(cursor=None))
    first = boards.page("indeed", INDEED_ARGS, "relevant", None)
    assert first.requests == 1 and first.next == "c2"
    (row,) = first.rows
    assert "Spark" in row["description"] and first.detailed == {row["job_url"]}
    last = boards.page("indeed", INDEED_ARGS, "recent", first.next)
    assert last.next is None
    q1, q2 = (r["query"] for r in sent)
    assert "sort: RELEVANCE" in q1 and "limit: 25" in q1 and "cursor:" not in q1
    assert "sort: DATE" in q2 and 'cursor: "c2"' in q2


def test_indeed_falls_back_to_relevance_if_it_refuses_the_date_sort(monkeypatch):
    sent = fake_board(monkeypatch, REFUSED, indeed_page(), indeed_page())
    r = boards.page("indeed", INDEED_ARGS, "recent", None)
    assert len(r.rows) == 1 and not r.error and r.requests == 2
    assert not boards._indeed_by_date  # the next pages ask by relevance directly
    boards.page("indeed", INDEED_ARGS, "recent", None)
    assert ["DATE" in x["query"] for x in sent] == [True, False, False]


def test_an_indeed_outage_keeps_the_date_sort_and_isnt_retried(monkeypatch):
    sent = fake_board(monkeypatch, Response(status=500))
    r = boards.page("indeed", INDEED_ARGS, "recent", None)
    assert r.error and r.requests == 1 and len(sent) == 1 and boards._indeed_by_date


def test_a_bad_request_by_date_is_a_refused_sort(monkeypatch):
    sent = fake_board(monkeypatch, Response(status=400), indeed_page())
    r = boards.page("indeed", INDEED_ARGS, "recent", None)
    assert len(r.rows) == 1 and len(sent) == 2 and not boards._indeed_by_date


def test_a_later_page_refused_by_date_isnt_asked_by_relevance(monkeypatch):
    """Its cursor belongs to the date-sorted list: asking it by relevance would mix them."""
    sent = fake_board(monkeypatch, REFUSED)
    r = boards.page("indeed", INDEED_ARGS, "recent", "c2")
    assert r.error and len(sent) == 1 and boards._indeed_by_date


def test_a_throttled_indeed_page_is_not_asked_again(monkeypatch):
    sent = fake_board(monkeypatch, Response(status=429))
    r = boards.page("indeed", INDEED_ARGS, "recent", None)
    assert r.blocked and len(sent) == 1


POSTING = (
    """<html><h1 class="top-card-layout__title">Backend Engineer</h1>{text}</html>"""
)
TEXT = '<div class="show-more-less-html__markup"><p>Go and Python.</p></div>'


def test_two_postings_in_a_row_without_their_text_are_a_block(monkeypatch):
    view = "https://www.linkedin.com/jobs/view/{}"
    fake_board(
        monkeypatch,
        Response(POSTING.format(text=""), url=view.format(1)),
        Response(POSTING.format(text=TEXT), url=view.format(2)),
        Response(POSTING.format(text=""), url=view.format(3)),
        Response(POSTING.format(text=""), url=view.format(4)),
        Response(POSTING.format(text=""), url=view.format(5)),
    )
    first = boards.open_linkedin("1")
    assert first.rows == [] and not first.blocked  # maybe just a removed posting
    assert boards.open_linkedin("2").rows  # a readable one resets the count
    assert not boards.open_linkedin("3").blocked
    assert boards.open_linkedin("4").blocked
    # The block's pause takes over: after it, one removed posting isn't a new block.
    assert not boards.open_linkedin("5").blocked


def test_the_session_hook_counts_requests_and_spots_throttling():
    li = boards._LinkedIn()
    li.session = requests.Session()  # what JobSpy does inside scrape()
    (hook,) = li.session.hooks["response"]
    hook(SimpleNamespace(status_code=200, url="https://www.linkedin.com/jobs/view/1"))
    assert (li.requests, li.blocked) == (1, False)
    hook(SimpleNamespace(status_code=200, url="https://www.linkedin.com/authwall?x=1"))
    assert (li.requests, li.blocked) == (2, True)
    ind = boards._Indeed()
    ind.session = requests.Session()
    ind.session.hooks["response"][0](
        SimpleNamespace(status_code=429, url="https://apis.indeed.com/graphql")
    )
    assert ind.blocked


def test_rows_are_annualised_and_dated_as_text():
    post = JobPost(
        job_url="u",
        title="t",
        date_posted=date(2026, 11, 2),
        interval=CompensationInterval.MONTHLY,
        min_amount=5000,
        max_amount=6000,
        currency="CHF",
    )
    row = boards.to_row(post)
    assert (row["min_amount"], row["max_amount"]) == (60000, 72000)
    assert row["date_posted"] == "2026-11-02"


def test_linkedin_requests_carry_no_login():
    """Guest access only: an account's cookies or tokens must never reach LinkedIn."""
    sent = {k.lower() for k in boards.LINKEDIN_HEADERS}
    assert not sent & {"cookie", "authorization", "csrf-token", "x-li-track"}
