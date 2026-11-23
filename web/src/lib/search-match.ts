import type { JobType, MatchCheck, WorkMode } from "@/lib/api"
import { compact } from "@/lib/format"
import { msgs } from "@/lib/i18n"

/** One condition of the search, as the posting's sheet shows it. */
export interface MatchLine {
  state: MatchCheck["state"]
  text: string
}

const list = (items: string[]) => items.join(msgs().match.or)
const money = (n: number, cur: string) => `${cur} ${compact(n)}`

/** The sheet's words for one check; null for one met that adds nothing (a recent posting). */
export function describe(c: MatchCheck): MatchLine | null {
  const m = msgs()
  const t = m.match
  const line = (text: string) => ({ state: c.state, text })
  switch (c.kind) {
    case "place":
      return line(c.state === "ok" ? String(c.value ?? m.common.anywhere) : c.state === "unknown" ? t.placeUnknown : t.placeNo)
    case "mode": {
      const wanted = list(((c.expected as string[]) ?? []).map((x) => m.modes[x as WorkMode]))
      const mode = m.modes[(c.value as WorkMode) ?? "unknown"]
      return line(c.state === "ok" ? mode : c.state === "unknown" ? t.modeUnknown : t.modeNo(mode, wanted))
    }
    case "salary": {
      const cur = c.currency ?? ""
      const min = money(Number(c.expected), cur)
      if (c.state === "unknown") return line(t.salaryUnknown(min))
      const amount = money(Number(c.value), cur)
      return line(c.state === "ok" ? t.salaryOk(amount) : t.salaryNo(amount, min))
    }
    case "job_type": {
      const types = (v: unknown) => list(((v as string[]) ?? []).map((x) => m.jobTypes[x as JobType] ?? x))
      if (c.state === "unknown") return line(t.typeUnknown)
      return line(c.state === "ok" ? types(c.value) : t.typeNo(types(c.value), types(c.expected)))
    }
    case "posted":
      return c.state === "ok" ? null : line(c.state === "unknown" ? t.postedUnknown : t.postedNo)
  }
}
