import { getLocale, msgs } from "@/lib/i18n"

export type WorkMode = "onsite" | "hybrid" | "remote" | "unknown"
export type Site = "linkedin" | "indeed"
export type JobType = "fulltime" | "parttime" | "contract" | "internship" | "volunteer"
export type Sort = "posted" | "salary"
export type Direction = "desc" | "asc"

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
  first_seen: string
  /** Salary range in the filter's currency, when the posting states it in another one. */
  salary_converted: { min: number | null; max: number | null; currency: string } | null
  /** Which board searches found this job; `label` is the place's name ("Zurigo", "Ovunque"). */
  hits: { place: string; label: string | null; keyword: string }[]
}

export interface JobsPage {
  items: Job[]
  total: number
  overall: number
  /** Pagination snapshot: pass it back for the next pages. */
  as_of: number
  /** Date of the exchange rates used for salaries. */
  fx_date: string
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
   * "recent": an identical search ran shortly before, so it was skipped.
   * "skipped": put off, its board is paused or out of requests (why: `error`).
   */
  status: "pending" | "running" | "done" | "error" | "recent" | "skipped"
  /** Matching the query, new or already saved. */
  found: number
  new: number
  /** Discarded: outside the searched country. */
  abroad: number
  /** Discarded: the title can't match the query. */
  off_title: number
  /** Matching, but their page couldn't be read this time. */
  missed: number
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
export const CV_LANGUAGES = ["it", "en", "de", "ko"] as const
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
}

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

export const api = {
  places: (q: string) =>
    request<{ places: PlaceOption[]; offline: boolean }>(`/api/places?q=${encodeURIComponent(q)}`),
  jobs: (query: Query, sort: Sort, direction: Direction, offset: number, asOf: number | null, limit = 50) =>
    post<JobsPage>("/api/jobs", { query, sort, direction, offset, limit, as_of: asOf }),
  search: (query: Query, force = false) => post<RunSummary>(`/api/search${force ? "?force=true" : ""}`, query),
  cancel: () => post<{ ok: true }>("/api/cancel", {}),
  status: () => request<RunStatus>("/api/status"),
  saved: {
    list: () => request<SavedSearch[]>("/api/saved"),
    save: (name: string, query: Query) => post<SavedSearch & { created: boolean }>("/api/saved", { name, query }),
    remove: (id: number) => request<{ ok: true }>(`/api/saved/${id}`, { method: "DELETE" }),
    run: (id: number, force = false) => post<RunSummary>(`/api/saved/${id}/run${force ? "?force=true" : ""}`, {}),
  },
  ai: {
    get: () => request<AiEngines>("/api/ai"),
    choose: (provider: string, model: string | null) => put<AiEngines>("/api/ai", { provider, model }),
  },
  cv: {
    prefs: () => request<CvPrefs>("/api/cv/preferences"),
    savePrefs: (prefs: CvPrefs) => put<CvPrefs>("/api/cv/preferences", prefs),
    preview: (body: CvPreviewRequest) => post<{ pages: Partial<Record<CvTemplate, string>>; sample: boolean }>("/api/cv/preview", body),
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
  },
}
