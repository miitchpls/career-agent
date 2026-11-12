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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === "string" ? detail : "Richiesta non valida")
  }
  return body as T
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) })

export const api = {
  places: (q: string) =>
    request<{ places: PlaceOption[]; offline: boolean }>(`/api/places?q=${encodeURIComponent(q)}`),
  jobs: (query: Query, sort: Sort, direction: Direction, offset: number, asOf: number | null, limit = 50) =>
    post<JobsPage>("/api/jobs", { query, sort, direction, offset, limit, as_of: asOf }),
  search: (query: Query) => post<RunSummary>("/api/search", query),
  cancel: () => post<{ ok: true }>("/api/cancel", {}),
  status: () => request<RunStatus>("/api/status"),
  clear: () => request<{ ok: true }>("/api/jobs", { method: "DELETE" }),
  saved: {
    list: () => request<SavedSearch[]>("/api/saved"),
    save: (name: string, query: Query) => post<SavedSearch & { created: boolean }>("/api/saved", { name, query }),
    remove: (id: number) => request<{ ok: true }>(`/api/saved/${id}`, { method: "DELETE" }),
    run: (id: number) => post<RunSummary>(`/api/saved/${id}/run`, {}),
  },
}
