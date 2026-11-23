"""SQLite storage. `jobs` holds one row per posting; `hits` records which search found it."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal

from . import fx
from .query import Query, Sql, salary_in, where

DB_PATH = Path("data/jobs.db")
SCHEMA_VERSION = 6

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    url         TEXT PRIMARY KEY,
    site        TEXT NOT NULL,
    title       TEXT NOT NULL,
    company     TEXT,
    location    TEXT,
    work_mode   TEXT NOT NULL,      -- onsite | hybrid | remote | unknown (inferred from text)
    job_type    TEXT,               -- ",fulltime,contract," (query.JobType tokens), NULL = not stated
    date_posted TEXT,               -- YYYY-MM-DD
    min_amount  REAL,               -- annualised
    max_amount  REAL,
    currency    TEXT,
    description TEXT,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hits (
    url     TEXT NOT NULL REFERENCES jobs(url) ON DELETE CASCADE,
    place   TEXT NOT NULL,          -- "geo:<id>", legacy "city|cc", or "*" for anywhere
    label   TEXT,                   -- human name of the place, e.g. "Zurigo"
    keyword TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (url, place, keyword)
);
CREATE INDEX IF NOT EXISTS hits_place ON hits(place);
CREATE TABLE IF NOT EXISTS board_searches (
    fingerprint TEXT PRIMARY KEY,   -- site|keyword|place|remote|hours_old (PlannedQuery.fingerprint)
    ran_at      TEXT NOT NULL       -- last successful run, UTC ISO
);
CREATE TABLE IF NOT EXISTS board_requests (
    site     TEXT NOT NULL,
    made_at  TEXT NOT NULL,         -- UTC ISO, when the search ended
    requests INTEGER NOT NULL       -- HTTP requests that search made
);
CREATE INDEX IF NOT EXISTS board_requests_at ON board_requests(site, made_at);
CREATE TABLE IF NOT EXISTS board_pauses (
    site  TEXT PRIMARY KEY,         -- a board that throttled us is left alone until then
    until TEXT NOT NULL             -- UTC ISO
);
CREATE TABLE IF NOT EXISTS saved_searches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    query       TEXT NOT NULL,      -- JSON of career_agent.query.Query
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    last_run_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL             -- JSON
);
-- Profile. The original files stay on disk under data/, so an import can be rerun later.
CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sha256      TEXT NOT NULL UNIQUE,
    filename    TEXT,               -- NULL for pasted text
    mime        TEXT NOT NULL,
    path        TEXT NOT NULL,      -- relative to the data directory
    text        TEXT NOT NULL,      -- what the AI read
    uploaded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_revisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    data        TEXT NOT NULL,      -- JSON of career_agent.profile.Profile; the latest row is the profile
    source      TEXT NOT NULL,      -- manual | import
    document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_drafts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status      TEXT NOT NULL,      -- running | ready | failed | confirmed | discarded
    provider    TEXT NOT NULL,
    model       TEXT,               -- NULL: the CLI's default
    data        TEXT,               -- JSON Profile, once ready (edited while reviewing)
    raw         TEXT,               -- the AI's answer as it came, for debugging
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_files (
    id          TEXT PRIMARY KEY,   -- random, used in the URL
    filename    TEXT,
    mime        TEXT NOT NULL,
    path        TEXT NOT NULL,      -- relative to the data directory
    created_at  TEXT NOT NULL
);
"""

JOB_COLUMNS = (
    "url",
    "site",
    "title",
    "company",
    "location",
    "work_mode",
    "job_type",
    "date_posted",
    "min_amount",
    "max_amount",
    "currency",
    "description",
)

Sort = Literal["posted", "salary"]
Direction = Literal["desc", "asc"]


def order_by(
    sort: Sort, direction: Direction, currency: str, rates: dict[str, float]
) -> Sql:
    """ORDER BY clause. Postings without the value always go last, whatever the direction;
    salaries are compared after converting them to `currency`."""
    d = "ASC" if direction == "asc" else "DESC"
    if sort == "posted":
        return Sql(f"date_posted IS NULL, date_posted {d}, first_seen {d}", [])
    amount = salary_in(currency, rates)
    return Sql(
        f"{amount.text} IS NULL, {amount.text} {d}", [*amount.params, *amount.params]
    )


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with connect() as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version < 2:
            # v1 had an incompatible layout and only ever held throwaway test data.
            conn.executescript("DROP TABLE IF EXISTS hits; DROP TABLE IF EXISTS jobs;")
        conn.executescript(SCHEMA)
        hit_columns = {r["name"] for r in conn.execute("PRAGMA table_info(hits)")}
        if "label" not in hit_columns:  # v2 -> v3
            conn.execute("ALTER TABLE hits ADD COLUMN label TEXT")
        job_columns = {r["name"] for r in conn.execute("PRAGMA table_info(jobs)")}
        if "job_type" not in job_columns:  # v3 -> v4
            conn.execute("ALTER TABLE jobs ADD COLUMN job_type TEXT")
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


def save_many(jobs: list[dict], place: str, label: str, keyword: str) -> int:
    """Insert or refresh jobs from one board search and record their hits, in one transaction.

    Returns how many jobs were new.
    """
    if not jobs:
        return 0
    now = _now()
    new = 0
    with connect() as conn:
        for job in jobs:
            known = conn.execute(
                "SELECT 1 FROM jobs WHERE url = ?", (job["url"],)
            ).fetchone()
            if known:
                conn.execute(
                    "UPDATE jobs SET last_seen = ? WHERE url = ?", (now, job["url"])
                )
            else:
                conn.execute(
                    f"INSERT INTO jobs ({', '.join(JOB_COLUMNS)}, first_seen, last_seen) "
                    f"VALUES ({', '.join('?' * (len(JOB_COLUMNS) + 2))})",
                    [job.get(c) for c in JOB_COLUMNS] + [now, now],
                )
                new += 1
            conn.execute(
                "INSERT OR REPLACE INTO hits (url, place, label, keyword, seen_at) VALUES (?, ?, ?, ?, ?)",
                (job["url"], place, label, keyword, now),
            )
    return new


def is_known(url: str) -> bool:
    with connect() as conn:
        return (
            conn.execute("SELECT 1 FROM jobs WHERE url = ?", (url,)).fetchone()
            is not None
        )


def search(
    q: Query,
    sort: Sort,
    offset: int,
    limit: int,
    as_of: int | None = None,
    direction: Direction = "desc",
) -> dict:
    """One page of matching jobs.

    `as_of` pins pagination to the jobs that existed when the first page was read (rowid),
    so rows inserted by a running search don't shift later pages. The client gets it back
    from the first page and passes it along.
    """
    fx_date, rates = fx.rates()
    w = where(q, rates)
    order = order_by(sort, direction, q.salary_currency, rates)
    with connect() as conn:
        if as_of is None:
            as_of = conn.execute("SELECT COALESCE(max(rowid), 0) FROM jobs").fetchone()[
                0
            ]
        pinned = f"{w.text} {'AND' if w.text else 'WHERE'} jobs.rowid <= ?"
        total = conn.execute(
            f"SELECT count(*) FROM jobs {pinned}", [*w.params, as_of]
        ).fetchone()[0]
        overall = conn.execute(
            "SELECT count(*) FROM jobs WHERE rowid <= ?", (as_of,)
        ).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM jobs {pinned} ORDER BY {order.text}, url LIMIT ? OFFSET ?",
            [*w.params, as_of, *order.params, limit, offset],
        ).fetchall()
        items = [dict(r) for r in rows]
        for i in items:
            i["salary_converted"] = _converted(i, q.salary_currency, rates)
        if items:
            urls = [i["url"] for i in items]
            hits = conn.execute(
                f"SELECT url, place, label, keyword FROM hits WHERE url IN ({', '.join('?' * len(urls))})",
                urls,
            ).fetchall()
            by_url: dict[str, list] = {}
            for h in hits:
                by_url.setdefault(h["url"], []).append(
                    {"place": h["place"], "label": h["label"], "keyword": h["keyword"]}
                )
            for i in items:
                i["hits"] = by_url.get(i["url"], [])
    return {
        "items": items,
        "total": total,
        "overall": overall,
        "as_of": as_of,
        "fx_date": fx_date,
    }


def _converted(job: dict, currency: str, rates: dict[str, float]) -> dict | None:
    """The posting's salary range in the filter's currency, when it's stated in another one."""
    cur = (job.get("currency") or "").upper()
    if (
        not cur
        or cur == currency
        or (job["min_amount"] is None and job["max_amount"] is None)
    ):
        return None
    lo = fx.convert(job["min_amount"], cur, currency, rates)
    hi = fx.convert(job["max_amount"], cur, currency, rates)
    if lo is None and hi is None:
        return None
    return {"min": lo, "max": hi, "currency": currency}


# --------------------------------------------------------------------------- saved searches


def _saved_row(r: sqlite3.Row) -> dict:
    return {**dict(r), "query": json.loads(r["query"])}


def list_saved() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM saved_searches ORDER BY COALESCE(last_run_at, updated_at) DESC"
        ).fetchall()
    return [_saved_row(r) for r in rows]


def get_saved(saved_id: int) -> dict | None:
    with connect() as conn:
        r = conn.execute(
            "SELECT * FROM saved_searches WHERE id = ?", (saved_id,)
        ).fetchone()
    return _saved_row(r) if r else None


def save_search(name: str, q: Query) -> tuple[dict, bool]:
    """Upsert by name. Returns (row, created)."""
    now = _now()
    payload = q.model_dump_json()
    with connect() as conn:
        # Names are matched case-insensitively, like the UI's "esiste già" check.
        existing = conn.execute(
            "SELECT id FROM saved_searches WHERE lower(name) = lower(?)", (name,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE saved_searches SET name = ?, query = ?, updated_at = ? WHERE id = ?",
                (name, payload, now, existing["id"]),
            )
            saved_id, created = existing["id"], False
        else:
            cur = conn.execute(
                "INSERT INTO saved_searches (name, query, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (name, payload, now, now),
            )
            saved_id, created = cur.lastrowid, True
    return get_saved(saved_id), created


def delete_saved(saved_id: int) -> bool:
    with connect() as conn:
        return (
            conn.execute(
                "DELETE FROM saved_searches WHERE id = ?", (saved_id,)
            ).rowcount
            > 0
        )


def mark_saved_run(saved_id: int) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE saved_searches SET last_run_at = ? WHERE id = ?", (_now(), saved_id)
        )


# --------------------------------------------------------------------------- board searches


def last_board_search(fingerprint: str) -> datetime | None:
    """When an identical board search last succeeded, if ever."""
    with connect() as conn:
        r = conn.execute(
            "SELECT ran_at FROM board_searches WHERE fingerprint = ?", (fingerprint,)
        ).fetchone()
    return datetime.fromisoformat(r["ran_at"]) if r else None


def record_board_search(fingerprint: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO board_searches (fingerprint, ran_at) VALUES (?, ?) "
            "ON CONFLICT(fingerprint) DO UPDATE SET ran_at = excluded.ran_at",
            (fingerprint, _now()),
        )


# --------------------------------------------------------------------------- board usage


def record_requests(site: str, requests: int) -> None:
    """Log the requests of one board search (counted against the daily budget)."""
    if not requests:
        return
    with connect() as conn:
        conn.execute(
            "INSERT INTO board_requests (site, made_at, requests) VALUES (?, ?, ?)",
            (site, _now(), requests),
        )
        # Only the last day counts: older rows are dead weight.
        conn.execute(
            "DELETE FROM board_requests WHERE made_at < ?",
            ((datetime.now(UTC) - timedelta(days=2)).isoformat(timespec="seconds"),),
        )


def requests_since(site: str, since: datetime) -> int:
    with connect() as conn:
        return conn.execute(
            "SELECT COALESCE(sum(requests), 0) FROM board_requests WHERE site = ? AND made_at >= ?",
            (site, since.isoformat(timespec="seconds")),
        ).fetchone()[0]


def pause_board(site: str, until: datetime) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO board_pauses (site, until) VALUES (?, ?) "
            "ON CONFLICT(site) DO UPDATE SET until = excluded.until",
            (site, until.isoformat(timespec="seconds")),
        )


def board_paused_until(site: str) -> datetime | None:
    """When a pause on `site` ends, if one is still running."""
    with connect() as conn:
        r = conn.execute(
            "SELECT until FROM board_pauses WHERE site = ?", (site,)
        ).fetchone()
    if not r:
        return None
    until = datetime.fromisoformat(r["until"])
    return until if until > datetime.now(UTC) else None


# --- Settings -----------------------------------------------------------------------------


def get_setting(key: str) -> str | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


# --- Profile ------------------------------------------------------------------------------

DRAFT_OPEN = ("running", "ready", "failed")


def data_dir() -> Path:
    """Where uploaded files live, next to the database."""
    return DB_PATH.parent


def add_document(
    sha256: str, filename: str | None, mime: str, path: str, text: str
) -> int:
    """Store an uploaded CV; the same file uploaded twice is one row."""
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM documents WHERE sha256 = ?", (sha256,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE documents SET filename = ?, uploaded_at = ? WHERE id = ?",
                (filename, _now(), row["id"]),
            )
            return row["id"]
        cur = conn.execute(
            "INSERT INTO documents (sha256, filename, mime, path, text, uploaded_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (sha256, filename, mime, path, text, _now()),
        )
        return cur.lastrowid


def get_document(doc_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    return dict(row) if row else None


def create_draft(document_id: int, provider: str, model: str | None) -> int:
    """A new import; whatever draft was open before is dropped."""
    now = _now()
    with connect() as conn:
        conn.execute(
            f"UPDATE profile_drafts SET status = 'discarded', updated_at = ? "
            f"WHERE status IN ({', '.join('?' * len(DRAFT_OPEN))})",
            (now, *DRAFT_OPEN),
        )
        cur = conn.execute(
            "INSERT INTO profile_drafts (document_id, status, provider, model, created_at, updated_at) "
            "VALUES (?, 'running', ?, ?, ?, ?)",
            (document_id, provider, model, now, now),
        )
        return cur.lastrowid


_DRAFT_FIELDS = {"status", "data", "raw", "error"}


def update_draft(draft_id: int, when_status: str | None = None, **fields) -> bool:
    """Set draft columns; with `when_status`, only if the draft is still in that state
    (so a run that finishes after being cancelled can't resurrect it)."""
    assert fields and set(fields) <= _DRAFT_FIELDS
    sets = ", ".join(f"{k} = ?" for k in fields)
    sql = f"UPDATE profile_drafts SET {sets}, updated_at = ? WHERE id = ?"
    params: list = [*fields.values(), _now(), draft_id]
    if when_status:
        sql += " AND status = ?"
        params.append(when_status)
    with connect() as conn:
        return conn.execute(sql, params).rowcount > 0


def _draft(row: sqlite3.Row | None) -> dict | None:
    if not row:
        return None
    d = dict(row)
    d["data"] = json.loads(d["data"]) if d["data"] else None
    d.pop("raw", None)
    return d


_DRAFT_SELECT = (
    "SELECT profile_drafts.*, documents.filename, documents.uploaded_at "
    "FROM profile_drafts JOIN documents ON documents.id = profile_drafts.document_id "
)


def get_draft(draft_id: int) -> dict | None:
    with connect() as conn:
        return _draft(
            conn.execute(
                _DRAFT_SELECT + "WHERE profile_drafts.id = ?", (draft_id,)
            ).fetchone()
        )


def open_draft() -> dict | None:
    """The import in progress, waiting for review, or just failed: at most one."""
    with connect() as conn:
        return _draft(
            conn.execute(
                _DRAFT_SELECT + f"WHERE status IN ({', '.join('?' * len(DRAFT_OPEN))}) "
                "ORDER BY profile_drafts.id DESC LIMIT 1",
                DRAFT_OPEN,
            ).fetchone()
        )


def fail_running_drafts(error: str) -> None:
    """At startup: no run survives a restart."""
    with connect() as conn:
        conn.execute(
            "UPDATE profile_drafts SET status = 'failed', error = ?, updated_at = ? "
            "WHERE status = 'running'",
            (error, _now()),
        )


def save_profile(data: dict, source: str, document_id: int | None = None) -> dict:
    """A new revision, unless nothing changed since the last one."""
    text = json.dumps(data, ensure_ascii=False, sort_keys=True)
    with connect() as conn:
        last = conn.execute(
            "SELECT * FROM profile_revisions ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if last and last["data"] == text and source == "manual":
            return _revision(last)
        cur = conn.execute(
            "INSERT INTO profile_revisions (data, source, document_id, created_at) VALUES (?, ?, ?, ?)",
            (text, source, document_id, _now()),
        )
        row = conn.execute(
            "SELECT * FROM profile_revisions WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return _revision(row)


def _revision(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "data": json.loads(row["data"]),
        "source": row["source"],
        "document_id": row["document_id"],
        "created_at": row["created_at"],
    }


def latest_profile() -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM profile_revisions ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return _revision(row) if row else None


def add_file(file_id: str, filename: str | None, mime: str, path: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO profile_files (id, filename, mime, path, created_at) VALUES (?, ?, ?, ?, ?)",
            (file_id, filename, mime, path, _now()),
        )


def get_file(file_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM profile_files WHERE id = ?", (file_id,)
        ).fetchone()
    return dict(row) if row else None


def clear_profile() -> list[str]:
    """Forget the profile entirely: revisions, drafts, uploaded CVs and attached files.
    Returns the stored paths (relative to the data directory) to delete from disk."""
    with connect() as conn:
        paths = [r["path"] for r in conn.execute("SELECT path FROM documents")]
        paths += [r["path"] for r in conn.execute("SELECT path FROM profile_files")]
        conn.executescript(
            "DELETE FROM profile_drafts; DELETE FROM profile_revisions; "
            "DELETE FROM documents; DELETE FROM profile_files;"
        )
    return paths
