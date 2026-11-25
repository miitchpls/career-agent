import type { JobType, MatchCheck, Query, WorkMode } from "@/lib/api"
import { compact } from "@/lib/format"
import { msgs } from "@/lib/i18n"

/** One condition of the search the posting departs from, as its sheet shows it. */
export interface MatchLine {
  state: Exclude<MatchCheck["state"], "ok">
  text: string
}

const list = (items: string[]) => items.join(msgs().match.or)
const money = (n: number, cur: string) => `${cur} ${compact(n)}`

/**
 * Whether a check keeps an opened posting out of the search's results (the server's
 * `query.unmet`): what it states against a filter, or not stating what the query wants stated.
 */
export function excludes(c: MatchCheck, q: Query): boolean {
  if (c.state === "no") return true
  if (c.state !== "unknown") return false
  if (c.kind === "mode") return true // an unknown mode is fine only when asked for ("ok" then)
  if (c.kind === "salary") return !q.salary_unknown
  if (c.kind === "job_type") return !q.job_type_unknown
  return false
}

/** "stipendio, modalità": the filters a posting misses, named. */
export const missedFilters = (kinds: MatchCheck["kind"][]) => {
  const t = msgs().match
  return kinds.map((k) => t.kinds[k]).join(t.list)
}

/**
 * The sheet's words for one check: what departs from the search, or can't be told. A met one
 * is null: the posting was found by the search, so saying it matches ("✓ Basel") is noise.
 */
export function describe(c: MatchCheck): MatchLine | null {
  const state = c.state
  if (state === "ok") return null
  const m = msgs()
  const t = m.match
  const line = (text: string): MatchLine => ({ state, text })
  const unknown = state === "unknown"
  switch (c.kind) {
    case "place":
      return line(unknown ? t.placeUnknown : t.placeNo)
    case "mode": {
      if (unknown) return line(t.modeUnknown)
      const wanted = list(((c.expected as string[]) ?? []).map((x) => m.modes[x as WorkMode]))
      return line(t.modeNo(m.modes[(c.value as WorkMode) ?? "unknown"], wanted))
    }
    case "salary": {
      const cur = c.currency ?? ""
      const min = money(Number(c.expected), cur)
      return line(unknown ? t.salaryUnknown(min) : t.salaryNo(money(Number(c.value), cur), min))
    }
    case "job_type": {
      if (unknown) return line(t.typeUnknown)
      const types = (v: unknown) => list(((v as string[]) ?? []).map((x) => m.jobTypes[x as JobType] ?? x))
      return line(t.typeNo(types(c.value), types(c.expected)))
    }
    case "posted":
      return line(unknown ? t.postedUnknown : t.postedNo)
  }
}
