"""SQLite storage. `jobs` holds the postings the user opened (with their text), never a
search's list: those live in memory for a while (feed.py)."""

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from . import fx
from .query import Query

log = logging.getLogger(__name__)

DB_PATH = Path("data/jobs.db")
SCHEMA_VERSION = 12

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
    last_seen   TEXT NOT NULL,
    places      TEXT                -- ",geo:1,*,": where the searches that found it looked
);
CREATE TABLE IF NOT EXISTS board_requests (
    site     TEXT NOT NULL,
    made_at  TEXT NOT NULL,         -- UTC ISO, when the search ended
    requests INTEGER NOT NULL       -- HTTP requests that search made
);
CREATE INDEX IF NOT EXISTS board_requests_at ON board_requests(site, made_at);
CREATE TABLE IF NOT EXISTS board_pauses (
    site  TEXT PRIMARY KEY,         -- a board that throttled us is left alone until then
    until TEXT NOT NULL,            -- UTC ISO
    strikes INTEGER NOT NULL DEFAULT 1  -- pauses in a row, each one longer
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
CREATE TABLE IF NOT EXISTS profile_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id INTEGER REFERENCES profile_revisions(id) ON DELETE CASCADE,  -- what was reviewed
    status      TEXT NOT NULL,      -- running | ready | failed | cancelled
    provider    TEXT NOT NULL,
    model       TEXT,
    suggestions TEXT,               -- JSON list of review.Suggestion, once ready
    dropped     INTEGER NOT NULL DEFAULT 0,  -- the AI's suggestions that failed the checks
    raw         TEXT,               -- the AI's answer as it came, for debugging
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT NOT NULL REFERENCES jobs(url) ON DELETE CASCADE,
    revision_id INTEGER REFERENCES profile_revisions(id) ON DELETE CASCADE,  -- the profile scored
    inputs      TEXT NOT NULL,      -- score.fingerprint: the posting's text and the score preferences
    status      TEXT NOT NULL,      -- running | ready | failed | cancelled
    provider    TEXT NOT NULL,
    model       TEXT,
    value       REAL,               -- 1.0-5.0, once ready
    decision    TEXT,               -- score.Decision, once ready
    result      TEXT,               -- JSON of score.Result, once ready
    raw         TEXT,               -- the AI's answer as it came, for debugging
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_scores_url ON job_scores(url, id);
CREATE TABLE IF NOT EXISTS job_cvs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT NOT NULL REFERENCES jobs(url) ON DELETE CASCADE,
    revision_id INTEGER REFERENCES profile_revisions(id) ON DELETE CASCADE,  -- the profile tailored
    inputs      TEXT NOT NULL,      -- tailor.fingerprint: the posting's text and the CV settings
    language    TEXT NOT NULL,      -- the CV's language (cv_render.CvLanguage)
    status      TEXT NOT NULL,      -- running | ready | failed | cancelled
    provider    TEXT NOT NULL,
    model       TEXT,
    result      TEXT,               -- JSON of tailor.Result, once ready
    raw         TEXT,               -- the AI's answer as it came, for debugging
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_cvs_url ON job_cvs(url, id);
CREATE TABLE IF NOT EXISTS applications (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    key              TEXT,              -- applications.posting_key; NULL without a link
    url              TEXT NOT NULL,     -- the board's canonical address, a page, or ""
    site             TEXT NOT NULL,     -- linkedin | indeed | other
    title            TEXT NOT NULL,
    company          TEXT NOT NULL,
    location         TEXT NOT NULL,
    posting          TEXT,              -- the posting's text as it was when added
    posting_saved_at TEXT,
    notes            TEXT NOT NULL,     -- the user's own
    cv               TEXT,              -- the CV template sent, if known
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS applications_key ON applications(key) WHERE key IS NOT NULL;
CREATE TABLE IF NOT EXISTS application_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    status         TEXT NOT NULL,       -- applications.Status
    at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS application_events_app ON application_events(application_id, id);
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
        if hit_columns and "label" not in hit_columns:  # v2 -> v3 (gone since v12)
            conn.execute("ALTER TABLE hits ADD COLUMN label TEXT")
        job_columns = {r["name"] for r in conn.execute("PRAGMA table_info(jobs)")}
        if "job_type" not in job_columns:  # v3 -> v4
            conn.execute("ALTER TABLE jobs ADD COLUMN job_type TEXT")
        if "places" not in job_columns:  # v11 -> v12
            conn.execute("ALTER TABLE jobs ADD COLUMN places TEXT")
        pause_columns = {
            r["name"] for r in conn.execute("PRAGMA table_info(board_pauses)")
        }
        if "strikes" not in pause_columns:  # v10 -> v11
            conn.execute(
                "ALTER TABLE board_pauses ADD COLUMN strikes INTEGER NOT NULL DEFAULT 1"
            )
        if 2 <= version < 12:
            _keep_opened_jobs(conn)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")


def _keep_opened_jobs(conn: sqlite3.Connection) -> None:
    """v11 -> v12: `jobs` held every posting a search found; now only those the user opened.

    Kept: postings opened from a link, scored, with a CV, or tracked as an application. The
    database is copied next to itself first (jobs.before-v12.db), since this deletes rows.
    """
    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master")}
    used = [
        "SELECT url FROM job_scores",
        "SELECT url FROM job_cvs",
        "SELECT url FROM applications",
    ]
    if "hits" in tables:
        used.append("SELECT url FROM hits WHERE place = 'link'")
    unused = f"FROM jobs WHERE url NOT IN ({' UNION '.join(used)})"
    gone = conn.execute(f"SELECT count(*) {unused}").fetchone()[0]
    if gone:
        backup = DB_PATH.with_name(f"{DB_PATH.stem}.before-v12{DB_PATH.suffix}")
        copy = sqlite3.connect(backup)
        try:
            conn.backup(copy)
        finally:
            copy.close()
        conn.execute(f"DELETE {unused}")
        log.warning("removed %d postings never opened; a copy is in %s", gone, backup)
    if "hits" in tables:  # where the kept postings were found, before the table goes
        conn.execute(
            "UPDATE jobs SET places = (SELECT ',' || group_concat(DISTINCT place) || ',' "
            "FROM hits WHERE hits.url = jobs.url AND place != 'link')"
        )
    conn.execute("DROP TABLE IF EXISTS hits")
    conn.execute("DROP TABLE IF EXISTS board_searches")


def _places_text(places: set[str]) -> str | None:
    return f",{','.join(sorted(places))}," if places else None


def save_job(job: dict, places: list[str] = ()) -> bool:
    """Store an opened posting (`JOB_COLUMNS`) and the places of the searches that found it;
    for one already stored, refresh `last_seen` and add the places. New: True."""
    now = _now()
    with connect() as conn:
        if _merge_places(conn, job["url"], places):
            conn.execute(
                "UPDATE jobs SET last_seen = ? WHERE url = ?", (now, job["url"])
            )
            return False
        conn.execute(
            f"INSERT INTO jobs ({', '.join(JOB_COLUMNS)}, first_seen, last_seen, places) "
            f"VALUES ({', '.join('?' * (len(JOB_COLUMNS) + 3))})",
            [job.get(c) for c in JOB_COLUMNS] + [now, now, _places_text(set(places))],
        )
    return True


def add_places(url: str, places: list[str]) -> None:
    """Add to an opened posting the places of searches that found it (again)."""
    with connect() as conn:
        _merge_places(conn, url, places)


def _merge_places(conn: sqlite3.Connection, url: str, places: list[str]) -> bool:
    """Add `places` to a stored posting's; False if it isn't stored."""
    row = conn.execute("SELECT places FROM jobs WHERE url = ?", (url,)).fetchone()
    if not row:
        return False
    known = set(filter(None, (row["places"] or "").split(",")))
    if not set(places) <= known:
        conn.execute(
            "UPDATE jobs SET places = ? WHERE url = ?",
            (_places_text(known | set(places)), url),
        )
    return True


def job_places(url: str) -> list[str]:
    """Where the searches that found an opened posting looked (place keys, "*")."""
    with connect() as conn:
        row = conn.execute("SELECT places FROM jobs WHERE url = ?", (url,)).fetchone()
    return sorted(filter(None, (row["places"] or "").split(","))) if row else []


def count_opened(urls: list[str]) -> int:
    """How many of `urls` the user opened."""
    if not urls:
        return 0
    with connect() as conn:
        return conn.execute(
            f"SELECT count(*) FROM jobs WHERE url IN ({', '.join('?' * len(urls))})",
            urls,
        ).fetchone()[0]


def opened(urls: list[str], currency: str, rates: dict[str, float]) -> dict[str, dict]:
    """The postings among `urls` the user opened, as list items, by url."""
    if not urls:
        return {}
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM jobs WHERE url IN ({', '.join('?' * len(urls))})", urls
        ).fetchall()
        return {i["url"]: i for i in _items(conn, rows, currency, rates)}


def _items(conn, rows, currency: str, rates: dict[str, float]) -> list[dict]:
    """Job rows as the API returns them: with the salary in `currency`, the last finished
    score and whether a CV was written."""
    items = [{**dict(r), "opened": True, "hits": []} for r in rows]
    for i in items:
        i["salary_converted"] = converted(i, currency, rates)
    if items:
        urls = [i["url"] for i in items]
        marks = ", ".join("?" * len(urls))
        scores = conn.execute(
            f"SELECT url, value, decision FROM job_scores WHERE id IN ("
            f"SELECT max(id) FROM job_scores WHERE status = 'ready' "
            f"AND url IN ({marks}) GROUP BY url)",
            urls,
        ).fetchall()
        by_score = {
            r["url"]: {"value": r["value"], "decision": r["decision"]} for r in scores
        }
        with_cv = {
            r["url"]
            for r in conn.execute(
                f"SELECT DISTINCT url FROM job_cvs WHERE status = 'ready' "
                f"AND url IN ({marks})",
                urls,
            )
        }
        for i in items:
            i["score"] = by_score.get(i["url"])
            i["has_cv"] = i["url"] in with_cv
    return items


def find_job(site: str, key: str, currency: str) -> dict | None:
    """A saved posting by its board id, as a jobs-list item: LinkedIn stores
    linkedin.com/jobs/view/<id>, Indeed its country domain's /viewjob?jk=<id>."""
    if site == "linkedin":
        sql, arg = "url = ?", f"https://www.linkedin.com/jobs/view/{key}"
    else:
        sql, arg = "url LIKE ?", f"%/viewjob?jk={key}"  # key is hex: no LIKE wildcards
    _, rates = fx.rates()
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM jobs WHERE site = ? AND {sql} LIMIT 1", (site, arg)
        ).fetchall()
        items = _items(conn, rows, currency, rates)
    return items[0] if items else None


def get_job(url: str) -> dict | None:
    """A saved posting's row, as stored."""
    with connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE url = ?", (url,)).fetchone()
    return dict(row) if row else None


def fill_job(url: str, **fields) -> None:
    """Fill a saved posting's text fields (a pasted description, for one the board left empty)."""
    assert fields and set(fields) <= {"description", "company", "location", "work_mode"}
    sets = ", ".join(f"{k} = ?" for k in fields)
    with connect() as conn:
        conn.execute(f"UPDATE jobs SET {sets} WHERE url = ?", [*fields.values(), url])


def converted(job: dict, currency: str, rates: dict[str, float]) -> dict | None:
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


def pause_board(site: str, until: datetime, strikes: int = 1) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO board_pauses (site, until, strikes) VALUES (?, ?, ?) "
            "ON CONFLICT(site) DO UPDATE SET until = excluded.until, strikes = excluded.strikes",
            (site, until.isoformat(timespec="seconds"), strikes),
        )


def last_pause(site: str) -> tuple[datetime, int] | None:
    """The latest pause on `site` (ended or not): when it ends, and its strike count."""
    with connect() as conn:
        r = conn.execute(
            "SELECT until, strikes FROM board_pauses WHERE site = ?", (site,)
        ).fetchone()
    return (datetime.fromisoformat(r["until"]), r["strikes"]) if r else None


def board_paused_until(site: str) -> datetime | None:
    """When a pause on `site` ends, if one is still running."""
    last = last_pause(site)
    return last[0] if last and last[0] > datetime.now(UTC) else None


# --- Settings -----------------------------------------------------------------------------


def get_setting(key: str) -> str | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
    return row["value"] if row else None


def delete_setting(key: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM settings WHERE key = ?", (key,))


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
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO documents (sha256, filename, mime, path, text, uploaded_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (sha256, filename, mime, path, text, _now()),
        )
        return cur.lastrowid


def document_by_sha(sha256: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE sha256 = ?", (sha256,)
        ).fetchone()
    return dict(row) if row else None


def touch_document(doc_id: int, filename: str | None) -> None:
    """The same file uploaded again: remember its latest name."""
    with connect() as conn:
        conn.execute(
            "UPDATE documents SET filename = ?, uploaded_at = ? WHERE id = ?",
            (filename, _now(), doc_id),
        )


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


# Stored instead of a message when no request (so no language) is around: translated on read.
INTERRUPTED = "import_interrupted"


def fail_running_drafts(error: str = INTERRUPTED) -> None:
    """At startup: no run survives a restart."""
    with connect() as conn:
        conn.execute(
            "UPDATE profile_drafts SET status = 'failed', error = ?, updated_at = ? "
            "WHERE status = 'running'",
            (error, _now()),
        )


# --- Profile reviews (review.py) ---------------------------------------------------------------


def create_review(revision_id: int, provider: str, model: str | None) -> int:
    """A new review; it replaces the previous one, whose suggestions no longer show."""
    now = _now()
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO profile_reviews (revision_id, status, provider, model, created_at, updated_at) "
            "VALUES (?, 'running', ?, ?, ?, ?)",
            (revision_id, provider, model, now, now),
        )
        return cur.lastrowid


_REVIEW_FIELDS = {"status", "suggestions", "dropped", "raw", "error"}


def update_review(review_id: int, when_status: str | None = None, **fields) -> bool:
    """Set review columns; with `when_status`, only if it's still in that state."""
    assert fields and set(fields) <= _REVIEW_FIELDS
    sets = ", ".join(f"{k} = ?" for k in fields)
    sql = f"UPDATE profile_reviews SET {sets}, updated_at = ? WHERE id = ?"
    params: list = [*fields.values(), _now(), review_id]
    if when_status:
        sql += " AND status = ?"
        params.append(when_status)
    with connect() as conn:
        return conn.execute(sql, params).rowcount > 0


def latest_review() -> dict | None:
    """The last review that wasn't cancelled: running, ready or failed."""
    return _review_row("status != 'cancelled'")


def last_ready_review() -> dict | None:
    """The last review that finished: the one whose suggestions the user works through."""
    return _review_row("status = 'ready'")


def _review_row(condition: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            f"SELECT * FROM profile_reviews WHERE {condition} ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    r = dict(row)
    r["suggestions"] = json.loads(r["suggestions"]) if r["suggestions"] else []
    r.pop("raw")
    return r


REVIEW_INTERRUPTED = "review_interrupted"  # an i18n key, translated when read


def fail_running_reviews(error: str = REVIEW_INTERRUPTED) -> None:
    """At startup: no review survives a restart."""
    with connect() as conn:
        conn.execute(
            "UPDATE profile_reviews SET status = 'failed', error = ?, updated_at = ? "
            "WHERE status = 'running'",
            (error, _now()),
        )


# --- AI runs about one posting (score.py, tailor.py) ----------------------------------------------
# job_scores and job_cvs share their lifecycle: a row per run, running -> ready | failed |
# cancelled, writes guarded by the status they expect.


def _create_run(table: str, cols: dict) -> int:
    now = _now()
    cols = {**cols, "status": "running", "created_at": now, "updated_at": now}
    with connect() as conn:
        cur = conn.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            list(cols.values()),
        )
        return cur.lastrowid


def _update_run(
    table: str, allowed: set[str], run_id: int, when_status: str | None, fields: dict
) -> bool:
    """Set a run's columns; with `when_status`, only if it's still in that state."""
    assert fields and set(fields) <= allowed
    sets = ", ".join(f"{k} = ?" for k in fields)
    sql = f"UPDATE {table} SET {sets}, updated_at = ? WHERE id = ?"
    params: list = [*fields.values(), _now(), run_id]
    if when_status:
        sql += " AND status = ?"
        params.append(when_status)
    with connect() as conn:
        return conn.execute(sql, params).rowcount > 0


def _run_row(table: str, url: str, condition: str, extra: str = "") -> dict | None:
    """The posting's last run matching `condition`, without the AI's raw answer."""
    with connect() as conn:
        row = conn.execute(
            f"SELECT *{extra} FROM {table} AS r WHERE url = ? AND {condition} "
            "ORDER BY id DESC LIMIT 1",
            (url,),
        ).fetchone()
    if not row:
        return None
    r = dict(row)
    r["result"] = json.loads(r["result"]) if r["result"] else None
    r.pop("raw")
    return r


def _fail_running(table: str, error: str) -> None:
    """At startup: no run survives a restart."""
    with connect() as conn:
        conn.execute(
            f"UPDATE {table} SET status = 'failed', error = ?, updated_at = ? "
            "WHERE status = 'running'",
            (error, _now()),
        )


# Job scores

SCORE_INTERRUPTED = "score_interrupted"  # an i18n key, translated when read
_SCORE_FIELDS = {"status", "value", "decision", "result", "raw", "error"}


def create_score(
    url: str, revision_id: int, inputs: str, provider: str, model: str | None
) -> int:
    return _create_run(
        "job_scores",
        {
            "url": url,
            "revision_id": revision_id,
            "inputs": inputs,
            "provider": provider,
            "model": model,
        },
    )


def update_score(score_id: int, when_status: str | None = None, **fields) -> bool:
    return _update_run("job_scores", _SCORE_FIELDS, score_id, when_status, fields)


def latest_score(url: str) -> dict | None:
    """The posting's last score that wasn't cancelled: running, ready or failed."""
    return _run_row("job_scores", url, "status != 'cancelled'")


def last_ready_score(url: str) -> dict | None:
    return _run_row("job_scores", url, "status = 'ready'")


def fail_running_scores(error: str = SCORE_INTERRUPTED) -> None:
    _fail_running("job_scores", error)


# Tailored CVs

CV_INTERRUPTED = "cv_interrupted"  # an i18n key, translated when read
_CV_FIELDS = {"status", "result", "raw", "error"}
# How many CVs were finished for the posting, up to this one.
_CV_VERSION = (
    ", (SELECT count(*) FROM job_cvs v WHERE v.url = r.url "
    "AND v.status = 'ready' AND v.id <= r.id) AS version"
)


def create_cv(
    url: str,
    revision_id: int,
    inputs: str,
    language: str,
    provider: str,
    model: str | None,
) -> int:
    return _create_run(
        "job_cvs",
        {
            "url": url,
            "revision_id": revision_id,
            "inputs": inputs,
            "language": language,
            "provider": provider,
            "model": model,
        },
    )


def update_cv(cv_id: int, when_status: str | None = None, **fields) -> bool:
    return _update_run("job_cvs", _CV_FIELDS, cv_id, when_status, fields)


def latest_cv(url: str) -> dict | None:
    """The posting's last CV that wasn't cancelled: running, ready or failed."""
    return _run_row("job_cvs", url, "status != 'cancelled'", _CV_VERSION)


def last_ready_cv(url: str) -> dict | None:
    return _run_row("job_cvs", url, "status = 'ready'", _CV_VERSION)


def count_cv_postings() -> int:
    """How many postings have a finished tailored CV."""
    with connect() as conn:
        return conn.execute(
            "SELECT count(DISTINCT url) FROM job_cvs WHERE status = 'ready'"
        ).fetchone()[0]


def fail_running_cvs(error: str = CV_INTERRUPTED) -> None:
    _fail_running("job_cvs", error)


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


def unused_files(older_than: timedelta = timedelta(minutes=10)) -> list[dict]:
    """Uploaded files neither the profile nor the open draft points to any more: a replaced
    photo, a removed attachment. Recent uploads are spared: a dialog may be about to save them."""
    cutoff = (datetime.now(UTC) - older_than).isoformat(timespec="seconds")
    with connect() as conn:
        used = " ".join(
            r[0]
            for r in conn.execute(
                "SELECT data FROM (SELECT data FROM profile_revisions ORDER BY id DESC LIMIT 1) "
                "UNION ALL SELECT data FROM profile_drafts "
                f"WHERE status IN ({', '.join('?' * len(DRAFT_OPEN))}) AND data IS NOT NULL",
                DRAFT_OPEN,
            )
        )
        rows = conn.execute(
            "SELECT * FROM profile_files WHERE created_at < ?", (cutoff,)
        ).fetchall()
    return [dict(r) for r in rows if f"/api/profile/files/{r['id']}" not in used]


def delete_file(file_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM profile_files WHERE id = ?", (file_id,))


def clear_profile() -> list[str]:
    """Forget the profile entirely: revisions, drafts, uploaded CVs and attached files.
    Returns the stored paths (relative to the data directory) to delete from disk."""
    with connect() as conn:
        paths = [r["path"] for r in conn.execute("SELECT path FROM documents")]
        paths += [r["path"] for r in conn.execute("SELECT path FROM profile_files")]
        conn.executescript(
            "DELETE FROM profile_reviews; DELETE FROM profile_drafts; DELETE FROM profile_revisions; "
            "DELETE FROM documents; DELETE FROM profile_files;"
        )
    return paths
