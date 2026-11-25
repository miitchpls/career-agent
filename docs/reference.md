# career-agent reference

How each part works, and the numbers behind it. The [README](../README.md) is the overview.

## Running it

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

## Addresses

Every page and every open posting or application has its own address, so back and forward, a reload
or a bookmark return to it, on the same tab:

| Address | Shows |
|---|---|
| `/` | Postings; the search's filters are in the query string |
| `/jobs/linkedin-4458087343` · `/fit` · `/cv` | The same, with that posting's sheet open on a tab |
| `/applications` | Applications |
| `/applications/linkedin-4458087343` · `/fit` · `/notes` · `/posting` · `/cv` | With that application open |
| `/profile` | Profile |

A LinkedIn or Indeed posting has the same id on both pages: its board and the board's own id. An application
with no such link uses its number (`/applications/app-12`). Opening a sheet adds a history entry and closing it
steps back; changing tab or switching to another posting replaces the entry. A posting address that isn't among
the saved postings offers to read it from the board or to paste its text. The old `?view=` addresses still work.

## Searching

The page opens empty. In the search bar, what you type is turned into filters (title, place, work mode, salary,
employment type, date), shown as a sentence whose parts you click to edit. The query lives in the URL, so a link
reproduces it.

The bar filters the postings **already saved**. **Find new jobs** (or **Run** on a saved search) turns the same
filters into board searches and starts them.

### Opening a posting from a link

Under the search bar, **Open it from a link** takes a posting's address. The board is recognised as the link is
pasted, and Enter opens the posting in the same sheet as a search result, which shows at once and fills in when
the posting arrives. Nothing else starts: no search, no CV.

- A posting already saved (found by a search, or opened from a link before) opens from the database, without
  asking the board.
- A new posting is read within the same limits as a search: refused while its board is paused, counted, and a
  sign of throttling pauses the board. It's saved with your jobs.
  - **LinkedIn**: from the posting's page, one request, counted in the daily budget.
  - **Indeed**: by its key, through the app API JobSpy searches with (Indeed's web pages sit behind a bot
    check), for the country of the link's domain (`it.indeed.com` is Italy, `www` the US).
- When the board won't show it (a login wall, a pause, a removed posting), there's one attempt and no
  workaround: the sheet offers **Paste the text** instead. Title, company, place and the posting's text, copied
  from the page you see, are saved under the same link without any request.

Accepted LinkedIn forms: `/jobs/view/<id>`, `/jobs/view/<title>-<id>`, any country subdomain, and list pages with
`?currentJobId=<id>`. Indeed: any page with `?jk=` or `?vjk=`.

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

What counts as a plausible salary depends on the currency (10 thousand to 10 million for most; more where one unit
is worth little, such as yen or won), so a typed year or phone number isn't read as one. Won can be typed as
Korean job sites write them: `연봉 6000만`, `6천만원`, `1억 2천만`, or a bare number in 만 once KRW is chosen; a
Korean UI shows them the same way.

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

## Applications

**Applications**, beside Jobs and Profile, tracks the postings you apply to. **Add** takes a LinkedIn or Indeed
link (read as when opening a posting) or a posting's text from any site; a posting is tracked once, whatever the
form of its link. Each application keeps:

- its history of statuses (to send, sent, first contact, interview, offer, rejected, no reply, withdrawn), changed
  in place from the list or its sheet;
- a **copy of the posting's text**, taken when it's added (from the text pasted, or the saved posting): it
  survives the posting being taken down and the saved postings being cleared;
- your notes, saved as you type;
- the posting's fit score and the tailored CV, on the same tabs as a posting's sheet.

At the top, the key numbers and a Sankey of the flow (sent → first contact → interview, then every ending in one
column) for a period; a click on a node or a band filters the list below, which also has status groups, a search
(position, company, place) and an order.

## Profile

Optional: searching works without it. The profile follows LinkedIn's sections (experience, education, skills,
languages, projects, certifications, honors and awards, interests) and accepts a photo and attachments. It also
holds what career-ops' CV payload prints and LinkedIn doesn't: a phone number, one line about each employer under
the role (career-ops' `context`), and skill categories, one CV line each (`Frontend: Angular, React`).

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

An experience is one role. Consecutive roles at the same employer (compared ignoring case,
accents and the legal form, so "Acme S.p.A." and "ACME" match) are shown as LinkedIn does:
the company once, with its whole span, and its roles underneath. Leaving and coming back
makes two groups. The import is told to keep each role, including promotions, as its own
entry, and to keep projects or clients within a role in its bullets.

### Profile review

**Review with AI**, on the profile page, runs the same AI CLI as the import over bullets, descriptions,
summary and headline. It proposes, one by one, each with the reason:

- a **rewrite** with the same facts (active verb, no filler), shown as a word diff;
- a **question** where a figure only you know would help: the improved text with blanks you fill in;
- a **skill** an entry's own text names but its skills list lacks.

Nothing changes until you press **Apply**, which is an ordinary edit (a new revision). The server drops any
suggestion that points at text that isn't there, or that brings in a fact the profile doesn't hold: a number, or
a name such as a tool, product or employer that appears nowhere in the profile. A suggestion whose text you've
edited since the review is marked as no longer applying. Suggestions are stored with the review, so they survive a
restart; if a later review fails or is interrupted, the last finished one's open suggestions stay on screen
until a new one finishes.

The edit dialogs refuse an end date before the start date (and an expiry before the issue date).

### Fit score

A saved posting can be scored against the profile, the way career-ops scores an offer. The score answers
"how well do you fit this job", not "is it what you're looking for now": that depends on the search, and the
sheet checks it separately (below). The AI CLI reads only the saved posting, the profile (without name, email
and links) and two settings that hold whatever the search, on the profile page under **For the score**:
dealbreakers in your own words ("no body rental") and an optional note. Nothing is fetched. It returns:

- the posting's requirements (at most 12; every critical and high one is kept), each with its importance
  (critical, high, meaningful, preferred, low signal), what that rests on (the posting's words, its structure,
  or an estimate), whether the profile covers it, and the profile line that shows it;
- three dimensions scored 1-5: CV match, pay (against the market), company. One without evidence has no score
  and doesn't count; it never becomes a neutral 3;
- red flags, the gaps worth preparing for interviews, and up to three checks that could change the score;
- one score from 1.0 to 5.0 and a one-sentence verdict.

The server checks the answer rather than trusting it. The decision comes from the score through one table
(4.5 strong apply, 4.0 apply, 3.0 consider, below skip). A quote must be in the posting's text as whole words,
or it's dropped; an importance the posting doesn't back can't be critical or high; a hard stop (a posting that
states one of your dealbreakers) needs the posting's words, and it forces skip without changing the number.
Confidence (high, medium, low) follows how many dimensions rest on evidence. A score is stored per posting and
marked stale when the profile, the dealbreakers and note, or the posting change; the list shows each posting's
last one.

### Your search, on each posting

A posting opened from the results shows how it meets the active search, condition by condition: the place
group it was found in, the work mode that group asks for, the minimum pay (in the search's currency), the
employment type and the posting's age. Each is met, not met, or unknown (the posting doesn't say). It's the
filters' own rules, computed on the server: no AI and no request to a board.

### CV preferences

Set on the profile page and saved on the server. They decide how a tailored CV is laid out:

| Preference | Choices | Automatic value |
|---|---|---|
| Language | posting's language, or one of the 13 below | Korean, Japanese, Chinese or Russian when the description is mostly in that script; else guessed from its common words; English when unclear |
| Format | automatic, A4, Letter | Letter for jobs in the US and Canada, A4 elsewhere |
| Style | one of the career-ops templates below | — |
| Photo | where usual, always, never | No photo for the US, Canada, the UK and Ireland, where CVs normally don't have one |
| Footer | free text, on every CV or only in the countries you pick | — (for example the data-processing consent Italian CVs end with, set to Italy, or a work-permit line) |
| Fixed sections | headline, summary, experience, projects, skills | Copied from the profile as they are (career-ops' `cv.locked_sections`) |
| Guidance | free text | The story to tell and house rules every CV follows (career-ops' `modes/_profile.md` and `_custom.md`) |

The country comes from the end of the posting's location, matched against country names in every UI language. The photo's shape (rounded, circle, square) is set on the photo itself, from its menu.

### Tailored CV

The **CV** tab of a posting (or of an application with a LinkedIn or Indeed posting) writes a CV for it, following
career-ops' `pdf` mode, with the AI CLI chosen in Preferences. Like career-ops' dashboard (`<<cv-json>>`), the AI
returns structured content and the server builds and checks the CV:

- The AI returns only what tailoring may change: 15-20 keywords copied from the posting, a headline, the summary,
  6-8 competency tags, each role's bullets (reordered within the role, reworded in the posting's vocabulary, each
  pointing at the bullet it rewrites), the 3-4 most relevant projects, the awards worth showing, and the skills in
  lines. Names, employers, titles, dates, the roles' order, education and certifications come from the profile.
- It reads the posting's fit score when one was finished for this profile (career-ops tailors from its evaluation
  report), and the CV guidance.
- A rewritten text that brings in a number or a name the profile doesn't hold goes back to the profile's wording
  (a bullet, a project) or is dropped (a sentence of the summary, a competency); so does a keyword the profile has
  no trace of. A headline that claims a seniority the profile doesn't show keeps the profile's. Every undone change
  is listed under **Fact check**. No bullet is lost; locked sections are copied as they are.
- The keywords are classified without AI, as career-ops' `jd-skill-gap.mjs` does: a skill you list, one your
  profile's text shows, or a gap. The coverage is how many of them the finished CV contains (`keyword-match.mjs`).
- **Download PDF** prints the CV in the chosen template with a Chromium-family browser found on the computer
  (Chrome, Chromium, Edge, Brave, or Playwright's Chromium), headless, without network: the same engine career-ops
  prints with.

**Settings** in the CV tab change the CV settings for that posting only (language, format, style, photo, footer,
fixed sections, plus guidance added to the default one); the defaults stay as set on the profile page. Language,
fixed sections and guidance apply from the next generation; the others change the preview and the PDF at once.

Each generation is a new version; a CV goes stale when the profile, the posting or the guidance changes. A posting's own settings that steer the writing count too.

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
and can be set as the default. Previews are rendered by the server in one request and shown in sandboxed iframes,
scaled from the real page size. Profile data never reaches the template's `<head>`, so it can't end up in its CSS.

Roles at one employer are grouped the same way: the company and its span once, then each
role with its own dates; a place all the roles share is written once. The `ats` template
keeps one block per role, company included, for parsers.

Core competencies appear only in tailored CVs. Interests are printed by the `standard` template only, as in
career-ops; the `ats` template gets the competencies as a skills line, as career-ops' `ats-payload.mjs` folds them.
Text wrapped in `**…**` is bold.

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

The UI is in Italian, English, German, Spanish, French, Portuguese, Dutch, Turkish, Russian, Indonesian, Chinese, Japanese and Korean (**Preferences**, ⌘/Ctrl+,). CVs can be written in the same 13 languages. The choice is stored in the browser; the
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
| `profile_reviews` | AI reviews and their suggestions, with whether each was applied or dismissed |
| `job_scores` | Fit scores, one row per run, with the profile revision scored |
| `job_cvs` | Tailored CVs, one row per run: the CV's content as a profile, keywords, checks, and the AI's raw answer |

**Start over** on the profile page deletes the profile, drafts, reviews, CVs and attachments. Postings and saved searches
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
  app.py       FastAPI app: mounts the routers, serves the built UI
  routes/      The JSON API, one router per area: jobs, search, applications, fit, cv, profile, ai
  workers.py   The background workers (search, import, review, scores, CVs), one of each
  schema.py    API model base, JSON-schema helpers for the AI answers, language names
  query.py     The query model: SQL filter and search plan
  scraper.py   Runs a search plan in the background: pauses, budget, back-off
  boards.py    LinkedIn and Indeed through JobSpy, counting requests; one posting from its link
  job_link.py  Pasted links: which posting, and opening it within the boards' limits
  db.py        SQLite schema and queries
  geo.py       City autocomplete and English names for the boards
  fx.py        ECB exchange rates
  profile.py   Profile model, CV reading, import pipeline, CV preferences
  review.py    AI review of the profile: prompt, schema, checks against new facts
  score.py     Fit score of a posting: preferences, prompt, schema, checks, bands
  tailor.py    CV tailored to a posting: prompt, schema, fact and keyword checks
  facts.py     What the profile says: tells a rephrasing from a new number or name
  pdf.py       HTML to PDF with a local Chromium-family browser
  applications.py  Applications: posting keys, history, notes, posting copies
  runs.py      Background AI runs (import, review, score, CV), one per kind or per posting, cancellable
  cv_render.py career-ops CV templates filled with the profile
  cv_templates/ the templates, copied from career-ops
  ai.py        AI CLI detection, settings and isolated runs
  i18n.py      Server messages in it/en/de/ko; i18n_extra.py the other nine languages
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
| `POST /api/jobs/open` | One posting from a pasted link: from the database when saved, else read from its board |
| `POST /api/jobs/paste` | A posting the board wouldn't show, saved under its link from the text the user copied |
| `GET/PUT /api/ai` | AI engines found, saved choice |
| `GET/PUT /api/cv/preferences` | CV language, format, style, photo, footer, fixed sections, guidance |
| `GET /api/jobs/cv?url=` · `POST /api/jobs/cv` · `DELETE /api/jobs/cv?url=` | A posting's tailored CV (and the last finished one) · start (`language`) · cancel |
| `GET/PUT /api/jobs/cv/settings` | A posting's own CV settings (each one set replaces the default for it only) |
| `POST /api/jobs/cv/pdf` · `GET /api/jobs/cv/count` | The last finished CV as a PDF, in a template and format · postings with a CV |
| `POST /api/cv/preview` | CV templates filled with a profile (or the sample) as HTML, several per request; optional highlighted texts |
| `GET/PUT/DELETE /api/profile` | Profile and open draft · save · delete everything |
| `POST /api/profile/import` | Start an import (multipart: `file` or `text`) |
| `PUT/DELETE /api/profile/draft` · `POST /api/profile/draft/confirm` · `POST /api/profile/draft/retry` | Review an import |
| `POST /api/profile/files` · `GET /api/profile/files/{id}` | Photos and attachments |
| `GET/POST/DELETE /api/profile/review` · `PATCH /api/profile/review/suggestions/{id}` | Latest AI review · start · cancel · mark a suggestion applied or dismissed |
| `GET /api/jobs/score?url=` · `POST /api/jobs/score` · `DELETE /api/jobs/score?url=` | A posting's fit score (and the last finished one) · start · cancel |
| `GET/POST /api/applications` · `PATCH/DELETE /api/applications/{id}` | Applications · track a posting (`created: false` when already tracked) · status, notes or posting copy · remove |
| `GET /api/jobs/saved?url=` | A saved posting by its link, without asking the board |
| `GET/PUT /api/score/preferences` | What the fit score reads whatever the search: dealbreakers and a note |
| `POST /api/jobs/match` | How a saved posting meets each condition of a search |

## Known limitations

- Excluding title words (`Query.title_none`) is supported by the API but not exposed in the UI.
- Importing a CV replaces the profile on confirm; it doesn't merge with what's there.
- Only Claude Code and Codex are supported as AI engines.
- Errors reported by the AI CLIs are shown in the CLI's language, usually English.
- The fact check is stricter than career-ops' `verify-cv-facts.mjs`: any number or name-shaped word missing from
  the profile undoes the change, so a rewording that is true but uses a term the profile lacks is undone too. Add
  the term to the profile when it's true.
- Roles keep their titles in the profile's language when the CV is written in another one.
- PDF export needs a Chromium-family browser on the computer.
