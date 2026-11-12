from datetime import date
from types import SimpleNamespace

import requests
from jobspy.model import CompensationInterval, JobPost

from career_agent import boards


class FakeLinkedIn:
    """Stands in for boards._LinkedIn: four postings on the list page (one request)."""

    def __init__(self, block_on=None):
        self.requests, self.blocked, self.error = 1, False, None
        self.opened = []
        self.block_on = block_on

    def scrape(self, scraper_input):
        self.input = scraper_input
        return [
            JobPost(id=f"li-{i}", job_url=f"https://li/{i}", title=f"T{i}")
            for i in range(4)
        ]

    def _fetch_details(self, job_id):
        self.opened.append(job_id)
        self.requests += 1
        if job_id == self.block_on:
            self.blocked = True
            return {}
        return {"description": f"about {job_id}"}


def search(
    monkeypatch, fake, *, wants=lambda r: True, cancelled=False, max_requests=None
):
    monkeypatch.setattr(boards, "_LinkedIn", lambda: fake)
    monkeypatch.setattr(boards, "DETAIL_PAUSE_SECONDS", (0, 0))
    return boards.search(
        "linkedin",
        {"search_term": "python", "location": "Zurich, Switzerland"},
        results=10,
        wants=wants,
        wait=lambda _s: cancelled,
        max_requests=max_requests,
    )


def test_only_wanted_postings_are_opened(monkeypatch):
    fake = FakeLinkedIn()
    r = search(monkeypatch, fake, wants=lambda row: row["title"] != "T1")
    assert fake.opened == ["0", "2", "3"]
    assert r.detailed == {"https://li/0", "https://li/2", "https://li/3"}
    assert len(r.rows) == 4 and r.rows[0]["description"] == "about 0"
    assert r.requests == 4
    assert fake.input.fetch_description is False  # JobSpy must not open them all itself


def test_opening_stops_at_the_budget(monkeypatch):
    fake = FakeLinkedIn()
    r = search(monkeypatch, fake, max_requests=3)  # list page + 2 postings
    assert fake.opened == ["0", "1"] and r.requests == 3


def test_opening_stops_at_the_first_block(monkeypatch):
    fake = FakeLinkedIn(block_on="1")
    r = search(monkeypatch, fake)
    assert fake.opened == ["0", "1"]
    assert r.blocked and r.detailed == {"https://li/0"}


def test_a_cancelled_run_opens_nothing(monkeypatch):
    fake = FakeLinkedIn()
    r = search(monkeypatch, fake, cancelled=True)
    assert fake.opened == [] and not r.detailed and len(r.rows) == 4


def test_a_suspicious_list_page_counts_as_blocked(monkeypatch):
    fake = FakeLinkedIn()
    fake.error = "unexpected page with no jobs (blocked?)"
    assert search(monkeypatch, fake).blocked


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
