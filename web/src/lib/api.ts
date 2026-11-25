import type { Application, AppStatus, NewApplication } from "@/lib/applications"
import { getLocale, msgs } from "@/lib/i18n"

export type WorkMode = "onsite" | "hybrid" | "remote" | "unknown"
export type Site = "linkedin" | "indeed"
export type JobType = "fulltime" | "parttime" | "contract" | "internship" | "volunteer"
/** How the boards order a search: their "Most relevant" or "Most recent" button. */
export type Order = "relevant" | "recent"

export interface Place {
  city: string
  /** ISO 3166-1 alpha-2, lowercase; inherited from the picked suggestion. */
  country: string
  region?: string | null
  /** GeoNames id from the autocomplete. */
  geo_id?: number | null
}

/** A city suggestion from /api/places. */
export interface PlaceOption {
  geo_id: number | null
  city: string
  region: string | null
  country: string
  country_name: string
}

export interface Scope {
  anywhere: boolean
  places: Place[]
  modes: WorkMode[]
}

/** Mirrors `career_agent.query.Query`. AND between fields, OR inside lists. */
export interface Query {
  scopes: Scope[]
  title_any: string[]
  title_none: string[]
  salary_min: number | null
  /** ISO code; salaries in other currencies are converted with ECB rates. */
  salary_currency: string
  salary_unknown: boolean
  posted_within: number | null
  job_types: JobType[]
  /** Keep postings that don't state their employment type. */
  job_type_unknown: boolean
  sites: Site[]
  search: string
}

export interface Job {
  url: string
  site: Site
  title: string
  company: string | null
  location: string | null
  work_mode: WorkMode
  /** ",fulltime,contract," or null when not stated. */
  job_type: string | null
  date_posted: string | null
  min_amount: number | null
  max_amount: number | null
  currency: string | null
  description: string | null
  /** When it was opened (stored); null for a posting only listed by a search. */
  first_seen: string | null
  /** Opened: its page was read and it's stored, with its text. */
  opened: boolean
  /**
   * In a search's list: what an opened LinkedIn posting's page says against the filters. Its
   * list card didn't say it, so it showed; it stays, marked, rather than vanish once opened.
   */
  unmet?: MatchCheck["kind"][]
  /** Salary range in the filter's currency, when the posting states it in another one. */
  salary_converted: { min: number | null; max: number | null; currency: string } | null
  /** Which cached searches found this job; `label` is the place's name ("Zurigo", "Ovunque"). */
  hits: { place: string; label: string | null; keyword: string }[]
  /** The posting's last finished fit score, if any. */
  score: { value: number; decision: ScoreDecision } | null
  /** Whether a tailored CV was finished for it (`/api/jobs/cv`). */
  has_cv?: boolean
}

/** What a search shows: the pages read in the last hours (`/api/feed`), never a request. */
export interface Feed {
  /** Matching the filters, in the boards' order, page after page. */
  items: Job[]
  /** Postings loaded, before the filters. */
  loaded: number
  /** Board searches the query makes, and how many of them aren't loaded (or expired). */
  searches: number
  missing: number
  /** Some search has a next page. */
  more: boolean
  /** When the oldest loaded search read its first page. */
  fetched_at: string | null
  fx_date: string
  /** Each board's requests left now (null: no budget) and why it's on hold, if it is. */
  boards: Record<Site, { left: number | null; hold: string | null }>
}

/** Returned when a portal search starts. */
export interface RunSummary {
  queries: number
  recent: number
  /** Searches put off because their board is paused or out of requests for today. */
  held: number
  held_reasons: string[]
  skipped: number
  skip_reasons: string[]
  eta_seconds: number
}

export type RunPhase = "idle" | "searching" | "pausing" | "done" | "cancelled"

/** One board search within a run. */
export interface RunStep {
  site: Site
  keyword: string
  place: string
  /**
   * "recent": its first page is cached, so it wasn't asked again.
   * "skipped": put off, its board is paused or out of requests (why: `error`).
   */
  status: "pending" | "running" | "done" | "error" | "recent" | "skipped"
  /** On the page read and matching the query; `new`: of those, never opened. */
  found: number
  new: number
  /** Discarded: outside the searched country. */
  abroad: number
  /** Discarded: the title can't match the query. */
  off_title: number
  error: string | null
  /** A caveat on a "done" step, e.g. the board started throttling. */
  note: string | null
  ran_at: string | null
}

export interface RunStatus {
  running: boolean
  started: string | null
  finished: string | null
  phase: RunPhase
  current: number | null
  pause_seconds: number | null
  steps: RunStep[]
  found: number
  new: number
  done_steps: number
  total_steps: number
}

export interface SavedSearch {
  id: number
  name: string
  query: Query
  created_at: string
  updated_at: string
  last_run_at: string | null
}

/** One AI CLI found (or not) on this computer: `/api/ai`. */
export interface AiProvider {
  id: "claude" | "codex"
  name: string
  command: string
  install_url: string
  /** What to run in a terminal to sign in. */
  login: string
  installed: boolean
  connected: boolean
  /** How it's signed in: "Pro", "ChatGPT", "API key". */
  plan: string | null
  models: { id: string; label: string }[]
}

/** model null: the CLI's own default. */
export interface AiChoice {
  provider: string | null
  model: string | null
}

export interface AiEngines {
  providers: AiProvider[]
  saved: AiChoice
  /** What an import would use now; null when nothing is connected. */
  active: AiChoice | null
}

/** An import: running, waiting for review (`data`), or failed (`error`). */
export interface ProfileDraft {
  id: number
  document_id: number
  status: "running" | "ready" | "failed"
  provider: string
  model: string | null
  /** Profile as drafted, with the user's edits while reviewing. */
  data: unknown | null
  error: string | null
  /** null for pasted text. */
  filename: string | null
  created_at: string
  updated_at: string
}

export interface ProfileState {
  /** The saved profile; null before the first save. */
  profile: unknown | null
  saved_at: string | null
  draft: ProfileDraft | null
}

/** Languages a CV can be written in (`career_agent.cv_render.CvLanguage`). */
export const CV_LANGUAGES = ["it", "en", "de", "ko", "zh", "es", "fr", "ja", "pt", "ru", "id", "nl", "tr"] as const
export type CvLanguage = (typeof CV_LANGUAGES)[number]

/** career-ops' CV templates, rendered by `career_agent.cv_render`. */
export const CV_TEMPLATES = ["standard", "modern", "compact", "executive", "leadership", "jake", "ats"] as const
export type CvTemplate = (typeof CV_TEMPLATES)[number]

export interface CvPreviewRequest {
  templates: CvTemplate[]
  language: CvLanguage
  format: "a4" | "letter"
  photo: boolean
  /** Shown exactly as given; null: the sample profile. */
  profile: unknown | null
  /** Texts to highlight: what a tailored CV moved. */
  marked?: string[]
  /** A tailored CV's keyword tags. */
  competencies?: string[]
  /** The line the CV ends with. */
  footer?: string
  /** A posting's own photo shape; by default the saved preference. */
  photoStyle?: CvPrefs["photoStyle"]
}

/** Sections a tailored CV copies from the profile as they are. */
export const LOCKED_SECTIONS = ["headline", "summary", "experience", "projects", "skills"] as const
export type LockedSection = (typeof LOCKED_SECTIONS)[number]

/** How tailored CVs are written: `/api/cv/preferences`. */
export interface CvPrefs {
  /** "job": the posting's language. */
  language: "job" | CvLanguage
  /** "auto": Letter for the US and Canada, A4 elsewhere. */
  format: "auto" | "a4" | "letter"
  /** One of career-ops' CV templates. */
  style: CvTemplate
  /** "auto": only where CVs usually carry a photo. */
  photo: "auto" | "always" | "never"
  photoStyle: "circle" | "square"
  /** A line at the bottom of the CV (a data-processing consent, a permit); "" for none. */
  footer: string
  /** Only for postings in these countries (ISO codes, lowercase); empty: on every CV. */
  footerCountries: string[]
  locked: LockedSection[]
  /** What every tailored CV should know: the story to tell, house rules. */
  guidance: string
}

// --- Tailored CV (career_agent.tailor) ------------------------------------------------------------

export interface TailoredCvResult {
  language: CvLanguage
  /** The CV's content, as a profile. */
  profile: unknown
  competencies: string[]
  /** Texts rewritten or moved, highlighted in the preview. */
  marked: string[]
  /** listed: a skill of the profile; supported: its text shows it; gap: no trace of it. */
  keywords: { term: string; kind: "listed" | "supported" | "gap"; inCv: boolean }[]
  /** % of the keywords the CV contains. */
  coverage: number | null
  /** What the AI says it changed, in the UI's language. */
  changes: string[]
  /** What the server's checks undid: `terms` triggered it, `text` is the AI's version. */
  warnings: {
    kind: "bullet_restored" | "project_restored" | "summary_trimmed" | "summary_kept" | "headline_kept" | "competency_dropped"
    terms: string[]
    text: string
  }[]
}

export interface TailoredCv {
  id: number
  url: string
  status: "running" | "ready" | "failed"
  language: CvLanguage
  provider: string
  model: string | null
  result: TailoredCvResult | null
  error: string | null
  created_at: string
  /** How many CVs were finished for this posting, up to this one. */
  version: number
  /** Ready CVs: the profile, the posting or the CV settings changed since. */
  stale?: boolean
}

export interface CvState {
  cv: TailoredCv | null
  earlier: TailoredCv | null
}

/** One posting's own CV settings: each one set (not null) replaces the default for it only. */
export interface CvOverrides {
  language: CvPrefs["language"] | null
  format: CvPrefs["format"] | null
  style: CvPrefs["style"] | null
  photo: CvPrefs["photo"] | null
  /** Whether this posting's CV ends with the footer, wherever the posting is. */
  footer: boolean | null
  locked: LockedSection[] | null
  /** Added to the default guidance, for this posting only. */
  notes: string
}

export interface CvPdfRequest {
  url: string
  template: CvTemplate
  format: "a4" | "letter"
  photo: boolean
  footer: string
}

export interface UploadedFile {
  id: string
  url: string
  name: string
  mime: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData sets its own multipart Content-Type.
  const json = !(init?.body instanceof FormData)
  const res = await fetch(path, {
    ...init,
    // The server phrases its errors and run messages in the UI's language.
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      "Accept-Language": getLocale(),
      ...init?.headers,
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === "string" ? detail : msgs().common.invalidRequest)
  }
  return body as T
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) })
const put = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(data) })
const del = <T>(path: string) => request<T>(path, { method: "DELETE" })

function form(fields: Record<string, string | Blob>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

/** One suggestion of an AI profile review (`career_agent.review.Suggestion`). */
export interface ReviewSuggestion {
  id: string
  /** rewrite: new text; question: new text with [[label]] blanks to fill in; add_skill: a skill. */
  kind: "rewrite" | "question" | "add_skill"
  section: "profile" | "experience" | "education" | "project" | "certification"
  /** null for the summary and the headline. */
  entryId: string | null
  field: "bullet" | "description" | "summary" | "headline" | "skill"
  index: number | null
  /** The text it replaces, as it was when reviewed ("" for add_skill). */
  before: string
  after: string
  reason: string
  state: "open" | "applied" | "dismissed"
}

export interface ProfileReview {
  id: number
  status: "running" | "ready" | "failed"
  provider: string
  model: string | null
  suggestions: ReviewSuggestion[]
  /** The AI's suggestions that failed the server's checks (new facts, stale text). */
  dropped: number
  error: string | null
  created_at: string
}

/**
 * The latest review, and while it runs or after it fails the last finished one, whose open
 * suggestions stay on screen until a newer review finishes.
 */
export interface ReviewState {
  review: ProfileReview | null
  earlier: ProfileReview | null
}

// --- Fit score (career_agent.score) -------------------------------------------------------------

/** From the score through one table: 4.5 strong apply, 4.0 apply, 3.0 consider, below skip. */
export type ScoreDecision = "strong_apply" | "apply" | "consider" | "skip"
export type ScoreDimension = "cv" | "salary" | "company"
export type Importance = "critical" | "high" | "meaningful" | "preferred" | "low_signal"

export interface ScoreResult {
  /** 1.0-5.0 */
  score: number
  decision: ScoreDecision
  verdict: string
  /** How many dimensions rest on evidence; not a probability. */
  confidence: "high" | "medium" | "low"
  /** A dimension without evidence has `score` null: it doesn't count. */
  dimensions: Record<ScoreDimension, { status: "supported" | "partial" | "unknown"; score: number | null; note: string }>
  /** Most important first; within a band, unmet first. */
  requirements: {
    requirement: string
    importance: Importance
    /** What the importance rests on: the posting's words, its structure, or an estimate. */
    evidence: "stated" | "structural" | "inferred"
    jdQuote: string | null
    match: "strong" | "partial" | "missing" | "na"
    profileEvidence: string
  }[]
  /** Requirements past the row budget. */
  omitted: number
  redFlags: { text: string; jdQuote: string | null; hardStop: boolean }[]
  hardStop: boolean
  gaps: { requirement: string; risk: string; mitigation: string }[]
  checks: string[]
}

export interface JobScore {
  id: number
  url: string
  status: "running" | "ready" | "failed"
  provider: string
  model: string | null
  value: number | null
  decision: ScoreDecision | null
  result: ScoreResult | null
  error: string | null
  created_at: string
  /** Ready scores: the profile, the score preferences or the posting changed since. */
  stale?: boolean
}

/** A posting's latest score and, while a new one runs or after it fails, the last finished one. */
export interface ScoreState {
  score: JobScore | null
  earlier: JobScore | null
}

/** What the fit score reads whatever the search (`career_agent.score.ScorePrefs`). */
export interface ScorePrefs {
  /** Hard no's in the user's words: a posting that states one is a "skip". */
  dealbreakers: string[]
  note: string
}

/** How a posting meets one condition of the current search (`career_agent.query.match`). */
export interface MatchCheck {
  kind: "place" | "mode" | "salary" | "job_type" | "posted"
  /** unknown: the posting doesn't say. */
  state: "ok" | "unknown" | "no"
  value?: string | number | string[] | null
  expected?: number | string[]
  currency?: string
}

/** A posting copied by the user from the board's page, when the board won't show it to us. */
export interface PastedPosting {
  title: string
  company: string
  location: string
  description: string
}

export interface SearchOptions {
  order: Order
  more?: boolean
  force?: boolean
}

const searchParams = ({ order, more = false, force = false }: SearchOptions) =>
  new URLSearchParams({ order, more: String(more), force: String(force) }).toString()

export const api = {
  places: (q: string) =>
    request<{ places: PlaceOption[]; offline: boolean }>(`/api/places?q=${encodeURIComponent(q)}`),
  feed: (query: Query, order: Order) => post<Feed>("/api/feed", { query, order }),
  /** One posting from a pasted link: from the database when saved, else read from the board. */
  openLink: (url: string, currency: string) => post<{ job: Job; known: boolean }>("/api/jobs/open", { url, currency }),
  applications: {
    list: () => request<Application[]>("/api/applications"),
    add: (a: NewApplication) => post<{ application: Application; created: boolean }>("/api/applications", a),
    update: (id: number, patch: { status?: AppStatus; notes?: string; posting?: string; cv?: string }) =>
      request<Application>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id: number) => del<{ ok: true }>(`/api/applications/${id}`),
  },
  /** A saved posting by its link, or null: never asks the board. */
  savedJob: (url: string, currency: string) =>
    request<{ job: Job | null }>(`/api/jobs/saved?url=${encodeURIComponent(url)}&currency=${currency}`),
  /** A posting the board wouldn't show, from the text the user copied: no request is made. */
  pasteJob: (url: string, posting: PastedPosting, currency: string) =>
    post<{ job: Job; known: boolean }>("/api/jobs/paste", { url, ...posting, currency }),
  score: {
    get: (url: string) => request<ScoreState>(`/api/jobs/score?url=${encodeURIComponent(url)}`),
    start: (url: string) => post<ScoreState>("/api/jobs/score", { url }),
    cancel: (url: string) => del<ScoreState>(`/api/jobs/score?url=${encodeURIComponent(url)}`),
  },
  scorePrefs: {
    get: () => request<ScorePrefs>("/api/score/preferences"),
    save: (prefs: ScorePrefs) => put<ScorePrefs>("/api/score/preferences", prefs),
  },
  /** How a saved posting meets each condition of a search: no AI, no request to a board. */
  match: (url: string, query: Query) => post<{ checks: MatchCheck[] }>("/api/jobs/match", { url, query }),
  /** `more`: the next page of each search. `force`: the first pages again, even if cached. */
  search: (query: Query, opts: SearchOptions) => post<RunSummary>(`/api/search?${searchParams(opts)}`, query),
  cancel: () => post<{ ok: true }>("/api/cancel", {}),
  status: () => request<RunStatus>("/api/status"),
  saved: {
    list: () => request<SavedSearch[]>("/api/saved"),
    save: (name: string, query: Query) => post<SavedSearch & { created: boolean }>("/api/saved", { name, query }),
    remove: (id: number) => request<{ ok: true }>(`/api/saved/${id}`, { method: "DELETE" }),
    run: (id: number, opts: SearchOptions) => post<RunSummary>(`/api/saved/${id}/run?${searchParams(opts)}`, {}),
  },
  ai: {
    get: () => request<AiEngines>("/api/ai"),
    choose: (provider: string, model: string | null) => put<AiEngines>("/api/ai", { provider, model }),
  },
  cv: {
    prefs: () => request<CvPrefs>("/api/cv/preferences"),
    savePrefs: (prefs: CvPrefs) => put<CvPrefs>("/api/cv/preferences", prefs),
    preview: (body: CvPreviewRequest) => post<{ pages: Partial<Record<CvTemplate, string>>; sample: boolean }>("/api/cv/preview", body),
    get: (url: string) => request<CvState>(`/api/jobs/cv?url=${encodeURIComponent(url)}`),
    start: (url: string, language: CvLanguage) => post<CvState>("/api/jobs/cv", { url, language }),
    cancel: (url: string) => del<CvState>(`/api/jobs/cv?url=${encodeURIComponent(url)}`),
    count: () => request<{ postings: number }>("/api/jobs/cv/count"),
    settings: (url: string) => request<CvOverrides>(`/api/jobs/cv/settings?url=${encodeURIComponent(url)}`),
    saveSettings: (url: string, settings: CvOverrides) => put<CvOverrides>("/api/jobs/cv/settings", { url, settings }),
    /** The PDF file and the name the server gives it. */
    pdf: async (body: CvPdfRequest): Promise<{ blob: Blob; filename: string }> => {
      const res = await fetch("/api/jobs/cv/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": getLocale() },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => null))?.detail
        throw new Error(typeof detail === "string" ? detail : msgs().common.invalidRequest)
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1]
      return { blob: await res.blob(), filename: name ?? "CV.pdf" }
    },
  },
  profile: {
    get: () => request<ProfileState>("/api/profile"),
    save: (profile: unknown) => put<ProfileState>("/api/profile", { profile }),
    clear: () => del<ProfileState>("/api/profile"),
    importFile: (file: File) =>
      request<ProfileState>("/api/profile/import", { method: "POST", body: form({ file }) }),
    importText: (text: string) =>
      request<ProfileState>("/api/profile/import", { method: "POST", body: form({ text }) }),
    retry: () => post<ProfileState>("/api/profile/draft/retry", {}),
    saveDraft: (profile: unknown) => put<ProfileState>("/api/profile/draft", { profile }),
    confirm: (profile: unknown) => post<ProfileState>("/api/profile/draft/confirm", { profile }),
    discard: () => del<ProfileState>("/api/profile/draft"),
    upload: (file: File) => request<UploadedFile>("/api/profile/files", { method: "POST", body: form({ file }) }),
    review: () => request<ReviewState>("/api/profile/review"),
    startReview: () => post<ReviewState>("/api/profile/review", {}),
    cancelReview: () => del<ReviewState>("/api/profile/review"),
    setSuggestion: (id: string, state: ReviewSuggestion["state"]) =>
      request<ReviewState>(`/api/profile/review/suggestions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ state }),
      }),
  },
}
