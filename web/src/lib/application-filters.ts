/**
 * The applications page's filters. The period is the page's: it narrows the numbers, the
 * chart and the list alike ("how did last month's applications go"). The others narrow the
 * list only, like the status groups beside them.
 */
import { lastActivity, type Application } from "@/lib/applications-mock"

/** Days back from today; null: since ever. */
export const PERIODS = [7, 30, 90, 365, null] as const
export type Period = (typeof PERIODS)[number]

export type Source = "linkedin" | "indeed" | "other"
export const SOURCES: Source[] = ["linkedin", "indeed", "other"]

export type ScoreBand = "high" | "mid" | "low" | "none"
export const SCORE_BANDS: ScoreBand[] = ["high", "mid", "low", "none"]

export type SortKey = "activity" | "sent" | "score"
export const SORTS: SortKey[] = ["activity", "sent", "score"]

export interface ListFilters {
  q: string
  sources: Source[] // empty: any
  scores: ScoreBand[] // empty: any
  sort: SortKey
}

export const NO_FILTERS: ListFilters = { q: "", sources: [], scores: [], sort: "activity" }

export const filtersActive = (f: ListFilters) => !!f.q.trim() || f.sources.length > 0 || f.scores.length > 0

/** When it was sent; for one not sent yet, when it was added. */
export const sentAt = (a: Application): string => (a.events.find((e) => e.status === "applied") ?? a.events[0]).at

export function inPeriod(a: Application, period: Period, now = Date.now()): boolean {
  if (period === null) return true
  return now - new Date(sentAt(a)).getTime() <= period * 86_400_000
}

export function scoreBand(a: Application): ScoreBand {
  const v = a.score?.value
  return v == null ? "none" : v >= 4 ? "high" : v >= 3 ? "mid" : "low"
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()

/** Every word of the search in the title, company or place (any order, accents aside). */
export function matches(a: Application, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fold(`${a.title} ${a.company} ${a.location}`)
  return words.every((w) => hay.includes(w))
}

export function applyFilters(apps: Application[], f: ListFilters): Application[] {
  const out = apps.filter(
    (a) =>
      matches(a, f.q) &&
      (!f.sources.length || f.sources.includes(a.site)) &&
      (!f.scores.length || f.scores.includes(scoreBand(a))),
  )
  const by: Record<SortKey, (a: Application, b: Application) => number> = {
    activity: (a, b) => lastActivity(b).localeCompare(lastActivity(a)),
    sent: (a, b) => sentAt(b).localeCompare(sentAt(a)),
    // Highest first; unscored last, then by activity.
    score: (a, b) => (b.score?.value ?? -1) - (a.score?.value ?? -1) || lastActivity(b).localeCompare(lastActivity(a)),
  }
  return out.sort(by[f.sort])
}
