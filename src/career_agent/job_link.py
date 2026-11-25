"""Opening one posting: from a search's list, or from a link pasted by the user.

Opening is what stores a posting. One already saved opens from the database, and one a cached
search returned with its text (Indeed) is saved from there: neither asks the board. Otherwise
it's read within the same limits as a search: refused while its board is paused or out of
requests, counted, and a sign of throttling pauses the board. LinkedIn: from the posting's
page. Indeed: by its key through the app API JobSpy searches with.

When the board won't show it (a login wall, a pause, a removed posting), the user may paste the
posting's text instead: it's saved under the same link, as if the board had returned it.
"""

import re
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlparse

from . import boards, db, feed, scraper
from .i18n import t

LinkSite = Literal["linkedin", "indeed"]

_LINKEDIN_ID = re.compile(r"(?:^|-)(\d{6,12})/?$")


@dataclass(frozen=True)
class Link:
    site: LinkSite
    key: str  # LinkedIn job id, or Indeed's "jk"
    url: str  # the canonical address the boards' rows use


def parse(raw: str) -> Link | None:
    """The posting a LinkedIn or Indeed link points at; None for anything else.

    LinkedIn: /jobs/view/<id>, /jobs/view/<slug>-<id>, or a list page with ?currentJobId=<id>,
    on any country subdomain. Indeed: any page with ?jk=<id> (viewjob, a search's side panel).
    """
    text = raw.strip()
    if not re.match(r"https?://", text, re.IGNORECASE):
        text = "https://" + text
    try:
        u = urlparse(text)
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    query = parse_qs(u.query)
    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        job_id = next(iter(query.get("currentJobId", [])), None)
        if not job_id:
            path = re.sub(r"^/comm", "", u.path)
            if path.startswith("/jobs/view/"):
                m = _LINKEDIN_ID.search(path.removeprefix("/jobs/view/"))
                job_id = m[1] if m else None
        if job_id and job_id.isdigit():
            return Link(
                "linkedin", job_id, f"https://www.linkedin.com/jobs/view/{job_id}"
            )
    if re.search(r"(^|\.)indeed\.[a-z.]+$", host):
        jk = next(iter(query.get("jk", [])), None) or next(
            iter(query.get("vjk", [])), None
        )
        if jk and re.fullmatch(r"[0-9a-f]{8,32}", jk):
            # The US site answers on both; JobSpy's rows say www.
            host = "www.indeed.com" if host == "indeed.com" else host
            return Link("indeed", jk, f"https://{host}/viewjob?jk={jk}")
    return None


class LinkError(Exception):
    """Why a link can't be opened, phrased for the user; `status` is the HTTP code to use."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


def open_link(raw: str, currency: str) -> tuple[dict, bool]:
    """The posting behind `raw` as a jobs-list item, and whether it was already saved."""
    link = parse(raw)
    if link is None:
        raise LinkError(t("link_unsupported"), 400)
    known = db.find_job(link.site, link.key, currency)
    if known:
        return known, True
    if link.site == "indeed" and boards.indeed_country(_host(link.url)) is None:
        raise LinkError(t("link_unsupported"), 400)
    cached = feed.cached(link.url)
    if cached and cached[1]:  # the search brought its text: nothing to ask
        db.save_job(cached[0], feed.places(link.url))
        return db.find_job(link.site, link.key, currency), False

    site = link.site
    hold = scraper.hold_reason(site)
    if hold:
        raise LinkError(hold, 409)
    # Same pacing as a search: opening postings one after another isn't a burst either.
    with scraper.board_lock(site):
        time.sleep(scraper.turn_wait(site))
        try:
            result = (
                boards.open_linkedin(link.key)
                if site == "linkedin"
                else boards.open_indeed(_host(link.url), link.key)
            )
        finally:
            scraper.asked(site)
    db.record_requests(site, result.requests)
    if result.blocked:
        until = scraper.block(site)
        raise LinkError(scraper.paused_message(site, until), 409)
    if result.error and not result.rows:
        raise LinkError(t("link_failed", site=scraper.SITE_NAME[site]), 502)
    if not result.rows:
        raise LinkError(t("link_unreadable"), 404)
    db.save_job(scraper.job_row(site, result.rows[0]), feed.places(link.url))
    return db.find_job(link.site, link.key, currency), False


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def saved_job(raw: str, currency: str) -> dict | None:
    """The saved posting behind a LinkedIn or Indeed link, if any. Never asks the board."""
    link = parse(raw)
    return db.find_job(link.site, link.key, currency) if link else None


def paste_job(
    raw: str,
    title: str,
    company: str,
    location: str,
    description: str,
    currency: str,
) -> tuple[dict, bool]:
    """A posting the user copied from the board, saved under its link; whether it was known.

    Makes no request. A posting already saved keeps what it has; the pasted text only fills
    a description the board left empty (then it counts as new: the list must refresh).
    """
    link = parse(raw)
    if link is None:
        raise LinkError(t("link_unsupported"), 400)
    title, company, location = (" ".join(x.split()) for x in (title, company, location))
    text = _pasted_text(description)
    if not title or not text:
        raise LinkError(t("link_paste_empty"), 400)
    known = db.find_job(link.site, link.key, currency)
    if known:
        if (known.get("description") or "").strip():
            return known, True
        where = known.get("location") or location
        db.fill_job(
            known["url"],
            description=text,
            company=known.get("company") or company or None,
            location=where,
            work_mode=known["work_mode"]
            if known["work_mode"] != "unknown"
            else scraper.classify_work_mode(known["title"], where, text, False),
        )
        return db.find_job(link.site, link.key, currency), False
    job = {
        "url": link.url,
        "site": link.site,
        "title": title,
        "company": company or None,
        "location": location,
        "work_mode": scraper.classify_work_mode(title, location, text, False),
        "job_type": None,
        "date_posted": None,
        "min_amount": None,
        "max_amount": None,
        "currency": None,
        "description": text,
    }
    db.save_job(job, feed.places(link.url))
    return db.find_job(link.site, link.key, currency), False


def _pasted_text(raw: str) -> str:
    """Copied page text as Markdown: paragraphs kept, a lone line break kept as a break."""
    paragraphs = re.split(r"\n\s*\n", raw.replace("\r\n", "\n").strip())
    return "\n\n".join(
        "  \n".join(line.strip() for line in p.splitlines() if line.strip())
        for p in paragraphs
        if p.strip()
    )
