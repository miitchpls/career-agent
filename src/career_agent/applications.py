"""Applications: the postings the user follows or applied to, and how each one is going.

Each keeps its own copy of the posting's text, taken when it's added, so its history survives
the posting being taken down or the saved postings being cleared. A posting is tracked once:
its key is the board's id for a LinkedIn or Indeed link (whatever form the link takes), host
and path for any other site; one added without a link has no key.
"""

import sqlite3
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from . import db, job_link

Status = Literal[
    "saved",
    "applied",
    "screening",
    "interview",
    "offer",
    "rejected",
    "ghosted",
    "withdrawn",
]


class NewApplication(BaseModel):
    url: str = Field("", max_length=2000)
    title: str = Field(min_length=1, max_length=300)
    company: str = Field("", max_length=300)
    location: str = Field("", max_length=300)
    description: str = Field("", max_length=50_000)
    status: Status = "applied"

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("title is empty")
        return v


class ApplicationPatch(BaseModel):
    status: Status | None = None
    notes: str | None = Field(None, max_length=20_000)
    posting: str | None = Field(None, max_length=50_000)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def posting_key(url: str) -> str | None:
    """One key per posting (mirrors web/src/lib/job-link.ts postingKey); None without a link."""
    url = url.strip()
    if not url:
        return None
    link = job_link.parse(url)
    if link:
        return f"{link.site}:{link.key}"
    u = urlparse(url if "://" in url else f"https://{url}")
    host = (u.hostname or "").lower().removeprefix("www.")
    return f"{host}{u.path.rstrip('/')}" if host else url


def add(body: NewApplication, currency: str = "CHF") -> tuple[dict, bool]:
    """Track a posting; the one already tracked, and False, when it is.

    A LinkedIn or Indeed link is stored as the board's canonical address. Its text comes from
    what was pasted, else from the saved posting (never from the board: reading it is the
    caller's choice). Pasted text for a board posting not saved yet is saved as one too, so it
    can be scored like any other.
    """
    url = body.url.strip()
    key = posting_key(url)
    if key and (known := _by_key(key)):
        return known, False
    link = job_link.parse(url) if url else None
    title, company, location = (
        " ".join(x.split()) for x in (body.title, body.company, body.location)
    )
    text = body.description.strip()
    if link:
        saved = job_link.saved_job(url, currency)
        # Pasted text saves the posting, or fills one the board left without text.
        if text and not (saved and (saved.get("description") or "").strip()):
            saved, _ = job_link.paste_job(url, title, company, location, text, currency)
        if saved:
            url = saved["url"]
            company = company or (saved.get("company") or "")
            location = location or (saved.get("location") or "")
            text = text or (saved.get("description") or "").strip()
        else:
            url = link.url
    site = link.site if link else "other"
    now = _now()
    try:
        app_id = _insert(
            key, url, site, title, company, location, text, body.status, now
        )
    except sqlite3.IntegrityError:
        # Added at the same moment by another request: that one stands.
        known = _by_key(key) if key else None
        if known is None:
            raise
        return known, False
    return get(app_id), True


def _insert(key, url, site, title, company, location, text, status, now) -> int:
    with db.connect() as conn:
        cur = conn.execute(
            "INSERT INTO applications (key, url, site, title, company, location, posting, "
            "posting_saved_at, notes, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
            (
                key,
                url,
                site,
                title,
                company,
                location,
                text or None,
                now if text else None,
                now,
                now,
            ),
        )
        app_id = cur.lastrowid
        conn.execute(
            "INSERT INTO application_events (application_id, status, at) VALUES (?, ?, ?)",
            (app_id, status, now),
        )
    return app_id


def update(app_id: int, patch: ApplicationPatch) -> dict | None:
    """A new status (dated now; the same one again changes nothing), notes, or a posting copy."""
    app = get(app_id)
    if app is None:
        return None
    now = _now()
    with db.connect() as conn:
        if patch.status and patch.status != app["events"][-1]["status"]:
            conn.execute(
                "INSERT INTO application_events (application_id, status, at) VALUES (?, ?, ?)",
                (app_id, patch.status, now),
            )
        if patch.notes is not None:
            conn.execute(
                "UPDATE applications SET notes = ? WHERE id = ?", (patch.notes, app_id)
            )
        if patch.posting is not None:
            text = patch.posting.strip()
            conn.execute(
                "UPDATE applications SET posting = ?, posting_saved_at = ? WHERE id = ?",
                (text or None, now if text else None, app_id),
            )
        conn.execute(
            "UPDATE applications SET updated_at = ? WHERE id = ?", (now, app_id)
        )
    return get(app_id)


def delete(app_id: int) -> bool:
    with db.connect() as conn:
        return (
            conn.execute("DELETE FROM applications WHERE id = ?", (app_id,)).rowcount
            > 0
        )


def get(app_id: int) -> dict | None:
    rows = _rows("WHERE a.id = ?", (app_id,))
    return rows[0] if rows else None


def all_() -> list[dict]:
    return _rows("", ())


def _by_key(key: str) -> dict | None:
    rows = _rows("WHERE a.key = ?", (key,))
    return rows[0] if rows else None


def _rows(where: str, params: tuple) -> list[dict]:
    """Applications with their events (oldest first) and their posting's last finished score."""
    with db.connect() as conn:
        rows = conn.execute(
            f"SELECT a.*, s.value AS score_value, s.decision AS score_decision "
            f"FROM applications a LEFT JOIN job_scores s ON s.id = ("
            f"  SELECT max(id) FROM job_scores WHERE url = a.url AND status = 'ready') "
            f"{where} ORDER BY a.id DESC",
            params,
        ).fetchall()
        ids = [r["id"] for r in rows]
        events: dict[int, list[dict]] = {i: [] for i in ids}
        if ids:
            for e in conn.execute(
                f"SELECT application_id, status, at FROM application_events "
                f"WHERE application_id IN ({', '.join('?' * len(ids))}) ORDER BY id",
                ids,
            ):
                events[e["application_id"]].append(
                    {"status": e["status"], "at": e["at"]}
                )
    return [
        {
            "id": r["id"],
            "url": r["url"],
            "site": r["site"],
            "title": r["title"],
            "company": r["company"],
            "location": r["location"],
            "score": {"value": r["score_value"], "decision": r["score_decision"]}
            if r["score_value"] is not None
            else None,
            "cv": r["cv"],
            "posting": {"description": r["posting"], "savedAt": r["posting_saved_at"]}
            if r["posting"]
            else None,
            "notes": r["notes"],
            "events": events[r["id"]],
        }
        for r in rows
    ]
