# career-agent

A local job search tool. It searches LinkedIn and Indeed through [JobSpy](https://github.com/speedyapply/JobSpy),
stores the postings in SQLite and lets you filter them in a browser UI. An optional profile, filled in by hand or
drafted from your CV by an AI CLI already installed on your computer, is the base for tailored CVs (still a mock).

Proof of concept: one user, one machine, no authentication.

## Quick start

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/) and Node.js 20+.

```bash
cd web && npm install && npm run build && cd ..   # builds the UI into src/career_agent/static
uv run career-agent                               # http://127.0.0.1:8000
```

| Variable | Default | |
|---|---|---|
| `HOST` | `127.0.0.1` | `0.0.0.0` exposes the app on the local network. There is no login: anyone on the network can use it. |
| `PORT` | `8000` | |

Data goes to `data/` in the working directory (see [Data on disk](#data-on-disk)).

## Searching

The page opens empty. In the search bar, what you type is turned into filters (title, place, work mode, salary,
employment type, date), shown as a sentence whose parts you click to edit. The query lives in the URL, so a link
reproduces it.

The bar filters the postings **already saved**. **Find new jobs** (or **Run** on a saved search) turns the same
filters into board searches and starts them.

### Filters

Different filters are combined with AND.

| Filter | URL parameter | Matches |
|---|---|---|
| Where | `where=Zurigo:ch:2657896:Zurigo~onsite.hybrid\|*~remote` | Scopes separated by `\|` are OR-ed. Inside a scope, places are OR-ed, modes are OR-ed, and places AND modes must both match. `*` is anywhere. |
| Title contains | `title=python developer,data engineer` | Any phrase; every word of a phrase must be in the title. |
| Salary | `salary=100&cur=EUR&nosalary=true` | Annual salary ≥ 100,000 in `cur` (default CHF), after converting the posting's currency. `nosalary` keeps postings without a salary. |
| Employment type | `jt=fulltime.parttime&jtnull=true` | Any of the types; `jtnull` keeps postings that don't state one. |
| Posted | `posted=168` | Posted in the last N hours. |
| Board | `sites=linkedin` | Any of the boards. |
| Free text | `q=fastapi` | Title, company or description. |

The work mode (on-site, hybrid, remote) is inferred from the posting's text, because LinkedIn's public endpoint
ignores its own work-type filter.

Salaries in other currencies are converted with the day's ECB reference rates, or a bundled table when the ECB
is unreachable. A salary in a currency the ECB doesn't publish counts as "not stated".

### Running a search

A query becomes one board search per board × place × title phrase, capped at **16 per run**. The searches run one
at a time, 10–20 s apart, and the results page shows their progress. A query needs at least one place (or
"anywhere") and one title phrase: these are the boards' search terms.

An identical search (same board, phrase, place, remote-only flag and date window) that succeeded in the last
**6 hours** is skipped, since its results are already saved. **Refresh anyway** runs it again; limits and pauses
still apply.

Indeed searches one country at a time, so "anywhere" scopes skip Indeed.

### Staying under the boards' limits

- **Indeed**: one request returns up to 50 postings with their descriptions.
- **LinkedIn**: one request per list page (10 postings). A posting's own page (description, employment type,
  salary) is opened only for postings that are new, in the right country and with a title that can match the
  query, with a 1.5–4 s pause between pages. Postings whose title can't match are dropped.
- **Daily budget**: at most 150 LinkedIn requests (list and posting pages) in any 24 hours. Searches over budget
  are postponed.
- **Back-off**: at the first sign of throttling (HTTP 403, 429 or 999, a redirect to the login page, a suspiciously
  empty page) the board is paused for 45 minutes. The pause survives a restart; searches on the other board go on.

### Places

City suggestions come from the [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api) (GeoNames
data, no key), through the backend. Only the typed text is sent. Names are shown in the UI's language and sent to
the boards in English. When the API is unreachable, a small offline catalogue is used.

## Profile

Optional: searching works without it. The profile follows LinkedIn's sections (experience, education, skills,
languages, projects, certifications) and accepts a photo and attachments.

You can fill it in by hand (every save is kept) or import a CV:

1. Upload a PDF, Markdown or text file, or paste the text. The file is kept and its text extracted locally. Scanned
   PDFs without selectable text are refused.
2. The selected AI CLI turns the text into a profile draft matching a JSON schema.
3. Every experience, education, project and certification must quote the CV verbatim. The server looks for that
   quote, and for the company, school or certificate name, in the extracted text. An entry it can't find is
   marked for review, as are entries the model itself flags (unclear dates, ambiguous roles) and skills it
   inferred.
4. You review and edit the draft. Nothing reaches the profile until you press **Confirm and save**. You can also
   discard the draft, retry a failed import, or cancel a running one.

A confirmed import replaces the current profile; earlier versions remain in the database.

### CV preferences

Set on the profile page and saved on the server. They decide how a tailored CV is laid out:

| Preference | Choices | Automatic value |
|---|---|---|
| Language | posting's language, Italian, English, German | Guessed from the posting's description; English when unclear |
| Format | automatic, A4, Letter | Letter for jobs in the US and Canada, A4 elsewhere |
| Style | one of the career-ops templates below | — |
| Photo | where usual, always, never | No photo for the US, Canada, the UK and Ireland, where CVs normally don't have one |

The country comes from the end of the posting's location.

### CV templates

The styles are [career-ops](https://github.com/career-ops-hq/career-ops)' HTML CV templates (MIT), copied unchanged
into `src/career_agent/cv_templates/`. `cv_render.py` fills them as career-ops' `build-cv-html.mjs` does: same
placeholders and section partials, contact row rebuilt from the fields present, empty sections removed. Profile
text is HTML-escaped; links keep only `http(s)`/`mailto` schemes; the photo must be one of the app's uploads.

| Template | Design | Suits |
|---|---|---|
| `standard` | career-ops' base: coloured headings, a rule under the header, sans-serif | Almost any application |
| `modern` | Oversized name, accent-bar headings, tinted summary panel, accent-coloured role titles | Product and tech roles |
| `compact` | Tight leading, small type, headings in a left column | Fitting a two-page history onto one page |
| `executive` | Serif, centred header, ruled small-caps headings, no colour | Banks, funds, traditional companies |
| `leadership` | Executive variant in sans-serif: name and companies in capitals | Senior and leadership applications |
| `jake` | HTML port of the "Jake's Resume" LaTeX layout | Engineering roles expecting that format |
| `ats` | One item per line, no grid, no photo | Boards that parse the CV |

All are single-column, so applicant tracking systems read them in order. **Compare styles**, on the profile page,
shows every template filled with your profile (or a sample) side by side; one opens large with its description
and can be set as the default. Previews are rendered by the server and shown in sandboxed iframes, scaled from the
real page size.

Not filled from the profile, because it has no such data: core competencies, awards, interests, phone. Those
sections are left out.

### AI engines

The import doesn't use an API key. It runs an AI CLI that is installed and signed in on the computer, so the
user's own subscription pays for it:

| Engine | Command | Sign-in check |
|---|---|---|
| Claude Code | `claude -p` | `claude auth status` |
| Codex | `codex exec` | `codex login status` |

**Preferences → AI engine** lists both, with their sign-in state and plan, and sets the default engine and model.
Without a choice, the first connected engine is used. If the chosen engine is signed out, the import says so
instead of switching engine.

Each run is isolated, because a CV is untrusted input:

- **Claude Code**: no tools (`--tools ""`); `--safe-mode`, so no hooks, plugins, MCP servers or CLAUDE.md; no saved
  session.
- **Codex**: every command-running, code, browser and app feature disabled, web search off, read-only sandbox,
  user config and rules ignored, no saved session.

Both run in an empty temporary directory and receive the CV inside `<cv>` tags, with the instruction to treat it as
data. Their output is validated against the schema before it becomes a draft.

## Languages

The UI is in Italian, English and German (**Preferences**, ⌘/Ctrl+,). The choice is stored in the browser; the
first visit uses the browser's language when supported, Italian otherwise. The server phrases its errors and
progress messages in the language the UI sends as `Accept-Language`; an import keeps the language it started with.

## Data on disk

Everything lives in `data/` (git-ignored):

| Path | Contents |
|---|---|
| `data/jobs.db` | SQLite database: postings, saved searches, board budgets and pauses, settings, profile |
| `data/documents/` | Uploaded CVs, named by their SHA-256 |
| `data/profile-files/` | Photos and attachments |

Profile tables:

| Table | Rows |
|---|---|
| `profile_revisions` | One per save; the latest is the profile |
| `profile_drafts` | Imports: running, waiting for review, failed, confirmed or discarded |
| `documents` | Uploaded CVs and their extracted text |
| `profile_files` | Photos and attachments. Files the profile no longer uses are deleted after the next save |

**Start over** on the profile page deletes the profile, drafts, CVs and attachments. Postings and saved searches
are unaffected.

## Development

```bash
uv run career-agent            # API and built UI on :8000
cd web && npm run dev          # UI with hot reload on :5173, proxies /api to :8000
```

| | Backend | Frontend (`web/`) |
|---|---|---|
| Tests | `uv run pytest` | `npm test` |
| Lint | `uvx ruff check src tests` | `npm run lint` |
| Format | `uvx ruff format src tests` | — |
| Types | — | `npx tsc -b` |

The backend tests never call the boards, the geocoding API, the ECB or the AI CLIs, and each test gets its own
database.

### Layout

```
src/career_agent/
  app.py       FastAPI routes; serves the built UI
  query.py     The query model: SQL filter and search plan
  scraper.py   Runs a search plan in the background: pauses, budget, back-off
  boards.py    LinkedIn and Indeed through JobSpy, counting requests
  db.py        SQLite schema and queries
  geo.py       City autocomplete and English names for the boards
  fx.py        ECB exchange rates
  profile.py   Profile model, CV reading, import pipeline, CV preferences
  cv_render.py career-ops CV templates filled with the profile
  cv_templates/ the templates, copied from career-ops
  ai.py        AI CLI detection, settings and isolated runs
  i18n.py      Server messages in it/en/de
web/           React UI, see web/README.md
tests/
```

### API

| Method and path | |
|---|---|
| `POST /api/jobs` | Saved postings matching a query, paginated |
| `POST /api/search` | Start board searches for a query (`?force=true`: refresh anyway) |
| `GET /api/status` · `POST /api/cancel` | Progress of the running search · stop it |
| `GET/POST /api/saved` · `DELETE /api/saved/{id}` · `POST /api/saved/{id}/run` | Saved searches |
| `GET /api/places?q=` | City suggestions |
| `GET/PUT /api/ai` | AI engines found, saved choice |
| `GET/PUT /api/cv/preferences` | CV language, format, style and photo |
| `POST /api/cv/preview` | A CV template filled with a profile (or the sample), as HTML |
| `GET/PUT/DELETE /api/profile` | Profile and open draft · save · delete everything |
| `POST /api/profile/import` | Start an import (multipart: `file` or `text`) |
| `PUT/DELETE /api/profile/draft` · `POST /api/profile/draft/confirm` · `POST /api/profile/draft/retry` | Review an import |
| `POST /api/profile/files` · `GET /api/profile/files/{id}` | Photos and attachments |

## Known limitations

- Excluding title words (`Query.title_none`) is supported by the API but not exposed in the UI.
- Importing a CV replaces the profile on confirm; it doesn't merge with what's there.
- Only Claude Code and Codex are supported as AI engines.
- Errors reported by the AI CLIs are shown in the CLI's language, usually English.
- The tailored CV for a posting is a mock: the match analysis and the list of changes are sample text, and the
  preview shows the profile as it is, in the chosen template. There is no PDF export yet.
