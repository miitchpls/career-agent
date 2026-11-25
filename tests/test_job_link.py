import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from career_agent import boards, db, job_link
from career_agent.app import app

client = TestClient(app)

JOB_ID = "4123456789"
CANONICAL = f"https://www.linkedin.com/jobs/view/{JOB_ID}"


@pytest.mark.parametrize(
    "raw",
    [
        f"https://www.linkedin.com/jobs/view/{JOB_ID}/",
        f"https://it.linkedin.com/jobs/view/senior-backend-engineer-at-acme-{JOB_ID}?trk=public_jobs",
        f"linkedin.com/jobs/view/{JOB_ID}",
        f"https://www.linkedin.com/jobs/search/?currentJobId={JOB_ID}&keywords=python",
        f"https://www.linkedin.com/jobs/collections/recommended/?currentJobId={JOB_ID}",
        f"https://www.linkedin.com/comm/jobs/view/{JOB_ID}",
    ],
)
def test_linkedin_links_resolve_to_the_posting(raw):
    assert job_link.parse(raw) == job_link.Link("linkedin", JOB_ID, CANONICAL)


def test_indeed_links_and_the_rest():
    link = job_link.parse("https://it.indeed.com/viewjob?jk=0123456789abcdef&from=serp")
    assert link == job_link.Link(
        "indeed",
        "0123456789abcdef",
        "https://it.indeed.com/viewjob?jk=0123456789abcdef",
    )
    assert job_link.parse(
        "https://www.indeed.com/jobs?q=go&vjk=0123456789abcdef"
    ).key == ("0123456789abcdef")
    for raw in (
        "https://www.linkedin.com/in/someone",
        "https://www.linkedin.com/jobs/view/abc",
        "https://evil-linkedin.com/jobs/view/4123456789",
        "https://jobs.example.com/123",
        "not a url",
    ):
        assert job_link.parse(raw) is None, raw


# --- Reading the page -------------------------------------------------------------------------

PAGE = """<html><head>
<script type="application/ld+json">{ld}</script></head><body>
<h1 class="top-card-layout__title">Senior Backend Engineer</h1>
<a class="topcard__org-name-link" href="#">Acme</a>
<span class="topcard__flavor topcard__flavor--bullet">Milano, Lombardia, Italia</span>
<div class="show-more-less-html__markup"><p>We build data platforms with <b>Python</b>. Hybrid, 2 days in office.</p></div>
<ul><li><h3 class="description__job-criteria-subheader">Employment type</h3>
<span class="description__job-criteria-text">Full-time</span></li></ul>
</body></html>"""
LD = {
    "@type": "JobPosting",
    "title": "Senior Backend Engineer",
    "datePosted": "2026-11-20T08:00:00.000Z",
    "hiringOrganization": {"@type": "Organization", "name": "Acme"},
}


class FakeResponse:
    def __init__(self, text, status=200, url=CANONICAL):
        self.text, self.status_code, self.url = text, status, url


def fake_linkedin(monkeypatch, response):
    """A session whose single GET returns `response`; returns the URLs it was asked for."""
    asked = []

    class Session:
        def __init__(self, *_a, **_k):
            self.hooks, self.headers = {"response": []}, {}

        def get(self, url, *_a, **_k):
            asked.append(url)
            for hook in self.hooks["response"]:
                hook(response)
            return response

    monkeypatch.setattr(boards, "RequestsRotating", Session)
    return asked


def test_a_posting_page_becomes_a_row_with_one_request(monkeypatch):
    asked = fake_linkedin(monkeypatch, FakeResponse(PAGE.format(ld=json.dumps(LD))))
    result = boards.open_linkedin(JOB_ID)
    assert asked == [CANONICAL] and result.requests == 1 and not result.blocked
    (row,) = result.rows
    assert (row["title"], row["company"], row["location"]) == (
        "Senior Backend Engineer",
        "Acme",
        "Milano, Lombardia, Italia",
    )
    assert row["date_posted"] == "2026-11-20" and row["job_url"] == CANONICAL
    assert "Python" in row["description"] and row["job_type"] == "fulltime"


def test_the_top_card_stands_in_for_missing_structured_data(monkeypatch):
    fake_linkedin(monkeypatch, FakeResponse(PAGE.format(ld="not json")))
    (row,) = boards.open_linkedin(JOB_ID).rows
    assert row["title"] == "Senior Backend Engineer" and row["date_posted"] is None


def test_a_login_wall_or_a_throttle_is_no_posting(monkeypatch):
    fake_linkedin(
        monkeypatch,
        FakeResponse("<html></html>", url="https://www.linkedin.com/authwall?x=1"),
    )
    result = boards.open_linkedin(JOB_ID)
    assert result.rows == [] and result.blocked
    fake_linkedin(monkeypatch, FakeResponse("", status=429))
    result = boards.open_linkedin(JOB_ID)
    assert result.rows == [] and result.blocked
    fake_linkedin(monkeypatch, FakeResponse("<html><body>Page not found</body></html>"))
    result = boards.open_linkedin(JOB_ID)
    assert result.rows == [] and not result.blocked


# --- The endpoint -----------------------------------------------------------------------------


def open_(url, lang="en"):
    return client.post(
        "/api/jobs/open", json={"url": url}, headers={"Accept-Language": lang}
    )


def test_a_new_link_is_read_saved_and_counted(monkeypatch):
    fake_linkedin(monkeypatch, FakeResponse(PAGE.format(ld=json.dumps(LD))))
    r = open_(f"https://it.linkedin.com/jobs/view/backend-{JOB_ID}?trk=x")
    assert r.status_code == 200
    body = r.json()
    assert body["known"] is False
    job = body["job"]
    assert (
        job["url"] == CANONICAL
        and job["site"] == "linkedin"
        and job["work_mode"] == "hybrid"
    )
    assert job["opened"] is True and db.get_job(CANONICAL) is not None
    assert db.requests_since("linkedin", datetime.now(UTC) - timedelta(minutes=1)) == 1

    # The second time it opens from the database: no request.
    monkeypatch.setattr(
        boards, "open_linkedin", lambda *_: pytest.fail("asked LinkedIn again")
    )
    r = open_(f"https://www.linkedin.com/jobs/search/?currentJobId={JOB_ID}")
    assert (
        r.json()["known"] is True
        and r.json()["job"]["title"] == "Senior Backend Engineer"
    )


def test_a_job_found_by_a_search_opens_without_a_request(monkeypatch):
    db.save_job(
        {
            "url": "https://it.indeed.com/viewjob?jk=0123456789abcdef",
            "site": "indeed",
            "title": "Go Developer",
            "company": "Beta",
            "location": "Torino",
            "work_mode": "onsite",
            "description": "",
        }
    )
    r = open_("https://www.indeed.com/viewjob?jk=0123456789abcdef")
    assert r.status_code == 200 and r.json()["known"] is True
    assert r.json()["job"]["title"] == "Go Developer"


def test_links_that_cant_be_opened_say_why(monkeypatch):
    assert (
        open_("https://jobs.example.com/1").json()["detail"]
        == "This isn't a LinkedIn or Indeed job link."
    )
    assert open_("https://xx.indeed.com/viewjob?jk=fedcba9876543210").status_code == 400

    db.pause_board("linkedin", datetime.now(UTC) + timedelta(minutes=30))
    r = open_(CANONICAL)
    assert r.status_code == 409 and "paused until" in r.json()["detail"]


# --- Indeed, by key through the app API ------------------------------------------------------

INDEED_JOB = {
    "key": "fedcba9876543210",
    "title": "Data Engineer",
    "sourceEmployerName": "Gamma",
    "dateOnIndeed": 1763600000000,
    "description": {"html": "<p>Spark e Python, <b>ibrido</b>.</p>"},
    "location": {"countryCode": "IT", "admin1Code": "PIE", "city": "Torino"},
    "compensation": {"estimated": None, "baseSalary": None, "currencyCode": None},
    "attributes": [{"key": "CF3CP"}],
    "employer": {
        "name": "Gamma Srl",
        "relativeCompanyPageUrl": None,
        "dossier": None,
        "ugcStats": None,
    },
    "recruit": {"viewJobUrl": None},
}


class JsonResponse:
    def __init__(self, body, status=200):
        self.body, self.status_code, self.url = (
            body,
            status,
            "https://apis.indeed.com/graphql",
        )

    def json(self):
        return self.body


def fake_indeed(monkeypatch, *responses):
    """A session whose POSTs return `responses` in turn; returns the (url, query, headers) sent."""
    sent, left = [], list(responses)

    class Session:
        def __init__(self, *_a, **_k):
            self.hooks, self.headers = {"response": []}, {}

        def post(self, url, json=None, **_k):
            sent.append((url, json["query"], dict(self.headers)))
            response = left.pop(0)
            for hook in self.hooks["response"]:
                hook(response)
            return response

    monkeypatch.setattr(boards, "RequestsRotating", Session)
    return sent


def test_an_indeed_link_is_read_by_key_for_its_country(monkeypatch):
    sent = fake_indeed(
        monkeypatch,
        JsonResponse({"data": {"jobData": {"results": [{"job": INDEED_JOB}]}}}),
    )
    r = open_("https://it.indeed.com/viewjob?jk=fedcba9876543210&from=serp")
    assert r.status_code == 200 and r.json()["known"] is False
    job = r.json()["job"]
    assert job["url"] == "https://it.indeed.com/viewjob?jk=fedcba9876543210"
    assert (job["site"], job["title"], job["company"], job["job_type"]) == (
        "indeed",
        "Data Engineer",
        "Gamma Srl",
        ",fulltime,",
    )
    assert job["work_mode"] == "hybrid" and "Torino" in job["location"]
    ((url, query, headers),) = sent
    assert (
        url == "https://apis.indeed.com/graphql"
        and 'jobKeys: ["fedcba9876543210"]' in query
    )
    assert headers["indeed-co"] == "IT" and headers["indeed-locale"] == "it-IT"
    assert db.requests_since("indeed", datetime.now(UTC) - timedelta(minutes=1)) == 1


def test_indeed_gets_the_other_query_shape_when_it_refuses_the_first(monkeypatch):
    sent = fake_indeed(
        monkeypatch,
        JsonResponse({"errors": [{"message": "Unknown argument 'input'"}]}),
        JsonResponse({"data": {"jobData": {"results": [{"job": INDEED_JOB}]}}}),
    )
    assert open_("https://it.indeed.com/viewjob?jk=fedcba9876543210").status_code == 200
    assert "input:" in sent[0][1] and "input:" not in sent[1][1]


def test_an_expired_or_throttled_indeed_posting(monkeypatch):
    fake_indeed(monkeypatch, JsonResponse({"data": {"jobData": {"results": []}}}))
    assert open_("https://it.indeed.com/viewjob?jk=fedcba9876543210").status_code == 404
    fake_indeed(monkeypatch, JsonResponse({}, status=429))
    r = open_("https://it.indeed.com/viewjob?jk=fedcba9876543210")
    assert r.status_code == 409 and db.board_paused_until("indeed") is not None


def test_a_throttled_read_pauses_linkedin(monkeypatch):
    fake_linkedin(monkeypatch, FakeResponse("", status=999))
    r = open_(CANONICAL)
    assert r.status_code == 409 and db.board_paused_until("linkedin") is not None


def test_a_removed_posting_is_reported(monkeypatch):
    fake_linkedin(monkeypatch, FakeResponse("<html><body>gone</body></html>"))
    r = open_(CANONICAL, lang="it")
    assert r.status_code == 404 and r.json()["detail"].startswith(
        "Non riesco a leggere"
    )


def test_an_indeed_answer_jobspy_cant_parse_is_a_failure_not_a_crash(monkeypatch):
    broken = INDEED_JOB | {"compensation": None}
    fake_indeed(
        monkeypatch, JsonResponse({"data": {"jobData": {"results": [{"job": broken}]}}})
    )
    assert open_("https://it.indeed.com/viewjob?jk=fedcba9876543210").status_code == 502


def paste(**kw):
    body = {
        "url": f"https://it.linkedin.com/jobs/view/{JOB_ID}",
        "title": "  Senior   Backend Engineer ",
        "company": "Acme",
        "location": "Zurigo",
        "description": "Chi siamo\r\nUn team piccolo.\r\n\r\n\r\nCosa farai\n- API in Go\n- Lavoro ibrido",
    } | kw
    return client.post("/api/jobs/paste", json=body)


def test_pasted_text_is_saved_under_the_link_without_a_request(monkeypatch):
    monkeypatch.setattr(
        boards, "open_linkedin", lambda *_: pytest.fail("asked LinkedIn")
    )
    r = paste()
    assert r.status_code == 200 and r.json()["known"] is False
    job = r.json()["job"]
    assert job["url"] == CANONICAL and job["title"] == "Senior Backend Engineer"
    assert job["company"] == "Acme" and job["work_mode"] == "hybrid"
    assert job["description"] == (
        "Chi siamo  \nUn team piccolo.\n\nCosa farai  \n- API in Go  \n- Lavoro ibrido"
    )
    assert job["opened"] is True
    assert db.requests_since("linkedin", datetime.now(UTC) - timedelta(minutes=1)) == 0
    # It now opens from the database, and a second paste doesn't overwrite it.
    assert open_(CANONICAL).json()["known"] is True
    again = paste(title="Altro")
    assert (
        again.json()["known"] is True
        and again.json()["job"]["title"] == "Senior Backend Engineer"
    )


def test_a_paste_needs_a_supported_link_a_title_and_text():
    assert paste(url="https://example.com/job/1").status_code == 400
    assert paste(title="   ").status_code == 400
    assert paste(description=" \n ").status_code == 400
    assert db.find_job("linkedin", JOB_ID, "CHF") is None


def test_bare_indeed_com_is_www_as_jobspy_writes_it():
    link = job_link.parse("indeed.com/viewjob?jk=0123456789abcdef")
    assert link.url == "https://www.indeed.com/viewjob?jk=0123456789abcdef"


def test_an_indeed_server_error_is_the_board_not_the_posting(monkeypatch):
    fake_indeed(monkeypatch, JsonResponse({}, status=503))
    r = open_("https://it.indeed.com/viewjob?jk=fedcba9876543210")
    assert r.status_code == 502 and db.board_paused_until("indeed") is None


def test_pasted_text_fills_a_saved_posting_the_board_left_empty():
    db.save_job(
        {
            "url": CANONICAL,
            "site": "linkedin",
            "title": "Backend Engineer",
            "company": "Acme",
            "location": "",
            "work_mode": "unknown",
            "description": None,
        }
    )
    r = paste(title="Ignored", company="Other", description="Lavoro ibrido a Zurigo.")
    assert r.status_code == 200 and r.json()["known"] is False
    job = r.json()["job"]
    # The text and the missing place come from the paste; what the board gave stays.
    assert job["description"] == "Lavoro ibrido a Zurigo."
    assert (job["title"], job["company"], job["location"]) == (
        "Backend Engineer",
        "Acme",
        "Zurigo",
    )
    assert job["work_mode"] == "hybrid"
    # Once it has text, a paste changes nothing.
    again = paste(description="Altro testo.")
    assert again.json()["known"] is True
    assert again.json()["job"]["description"] == "Lavoro ibrido a Zurigo."


def test_a_saved_posting_is_found_by_link_without_asking_the_board(monkeypatch):
    monkeypatch.setattr(
        boards, "open_linkedin", lambda *_: pytest.fail("asked LinkedIn")
    )
    get = lambda url: client.get("/api/jobs/saved", params={"url": url}).json()["job"]
    assert get(CANONICAL) is None
    assert paste().status_code == 200
    assert (
        get(f"https://it.linkedin.com/jobs/view/backend-{JOB_ID}?trk=x")["url"]
        == CANONICAL
    )
    assert get("https://example.com/jobs/1") is None


def test_a_posting_a_search_brought_with_its_text_is_saved_without_a_request(
    monkeypatch,
):
    from career_agent import feed
    from career_agent.query import Query, plan

    url = "https://it.indeed.com/viewjob?jk=0011223344556677"
    posting = {
        "url": url,
        "site": "indeed",
        "title": "Go Developer",
        "company": "Beta",
        "location": "Torino",
        "work_mode": "hybrid",
        "description": "Go, ibrido",
    }
    q = Query.model_validate(
        {
            "scopes": [{"places": [{"city": "Torino", "country": "it"}]}],
            "title_any": ["go"],
            "sites": ["indeed"],
        }
    )
    (pq,), _, _ = plan(q)
    feed.add_page(
        feed.key(pq, q, "relevant"), pq, "relevant", [posting], {url}, None, True
    )
    monkeypatch.setattr(boards, "open_indeed", lambda *_: pytest.fail("asked Indeed"))
    r = open_(url)
    assert r.status_code == 200 and r.json()["known"] is False
    assert db.get_job(url)["description"] == "Go, ibrido"
    assert db.job_places(url) == [
        pq.place_key
    ]  # where the search that listed it looked
    assert db.requests_since("indeed", datetime.now(UTC) - timedelta(minutes=1)) == 0


def test_opening_waits_its_turn_after_the_boards_last_request(monkeypatch):
    from career_agent import job_link, scraper

    fake_linkedin(monkeypatch, FakeResponse(PAGE.format(ld=json.dumps(LD))))
    slept = []
    monkeypatch.setattr(job_link.time, "sleep", slept.append)
    monkeypatch.setattr(
        scraper, "turn_wait", lambda site: 4.5 if site == "linkedin" else 0
    )
    assert open_(CANONICAL).status_code == 200
    assert slept == [4.5] and "linkedin" in scraper._last_request


def test_a_saved_posting_found_again_keeps_the_new_place(monkeypatch):
    from career_agent import feed
    from career_agent.query import Query, plan

    db.save_job(
        {"url": CANONICAL, "site": "linkedin", "title": "Go", "work_mode": "remote"}
    )
    q = Query.model_validate(
        {
            "scopes": [{"places": [{"city": "Basilea", "country": "ch"}]}],
            "title_any": ["go"],
            "sites": ["linkedin"],
        }
    )
    (pq,), _, _ = plan(q)
    card = {"url": CANONICAL, "title": "Go"}
    feed.add_page(
        feed.key(pq, q, "relevant"), pq, "relevant", [card], set(), None, True
    )
    assert open_(CANONICAL).json()["known"] is True
    assert db.job_places(CANONICAL) == [pq.place_key]


def test_a_pause_a_run_records_while_this_waits_stops_the_open(monkeypatch):
    """The hold is checked under the board's lock, after whoever held it is done."""
    from career_agent import scraper

    real_lock = scraper.board_lock("linkedin")

    class PausingFirst:
        def __enter__(self):
            real_lock.acquire()
            db.pause_board("linkedin", datetime.now(UTC) + timedelta(minutes=45))

        def __exit__(self, *_):
            real_lock.release()

    monkeypatch.setattr(scraper, "board_lock", lambda site: PausingFirst())
    monkeypatch.setattr(
        boards, "open_linkedin", lambda *_: pytest.fail("asked LinkedIn")
    )
    r = open_(CANONICAL)
    assert r.status_code == 409


def test_a_hidden_posting_is_listed_until_restored():
    first = "https://www.linkedin.com/jobs/view/1001"
    second = "https://www.linkedin.com/jobs/view/1002"
    assert client.get("/api/dismissed").json() == {"urls": []}
    for url in (first, second):
        body = {"url": url, "site": "linkedin", "title": "Data Engineer", "company": "Acme Analytics"}
        assert client.post("/api/dismissed", json=body).json() == {"ok": True}
    # Hiding it again changes nothing (the undo of a double click stays one restore).
    client.post("/api/dismissed", json={"url": first})
    assert set(client.get("/api/dismissed").json()["urls"]) == {first, second}

    assert client.delete("/api/dismissed", params={"url": first}).json()["restored"] is True
    assert client.delete("/api/dismissed", params={"url": first}).json()["restored"] is False
    assert client.get("/api/dismissed").json() == {"urls": [second]}


def test_hiding_needs_a_link():
    assert client.post("/api/dismissed", json={"url": ""}).status_code == 422
