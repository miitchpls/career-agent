/**
 * Checks that need no AI: instant, free, and recomputed on every edit. They point at an entry;
 * the review panel scrolls to it.
 */
import { msgs } from "@/lib/i18n"
import type { MonthYear, Profile } from "@/lib/profile"

export interface Check {
  id: string
  /** DOM id of what to show (`entry-<id>`). The headline and photo are the completeness card's. */
  target: string
  message: string
}

const LONG_BULLET = 280

const n = (d: MonthYear | null) => (d ? d.year * 12 + (d.month ?? 0) : null)
const now = () => {
  const d = new Date()
  return d.getFullYear() * 12 + d.getMonth()
}

function dates(start: MonthYear | null, end: MonthYear | null, current: boolean): "endBeforeStart" | "future" | null {
  const a = n(start)
  const b = current ? null : n(end)
  if (a !== null && b !== null && b < a) return "endBeforeStart"
  if (a !== null && a > now()) return "future"
  return null
}

export function profileChecks(p: Profile): Check[] {
  const t = msgs().review.checks
  const out: Check[] = []
  const add = (id: string, target: string, message: string) => out.push({ id, target, message })

  const seen = new Map<string, string>()
  for (const e of p.experiences) {
    const label = [e.role, e.company].filter(Boolean).join(" · ") || "—"
    const target = `entry-${e.id}`
    const when = dates(e.start, e.end, e.current)
    if (when) add(`${e.id}:${when}`, target, t[when](label))
    if (!e.bullets.length) add(`${e.id}:bullets`, target, t.noBullets(label))
    else if (!e.bullets.some((b) => /\d/.test(b))) add(`${e.id}:numbers`, target, t.noNumbers(label))
    e.bullets.forEach((b, i) => {
      if (b.length > LONG_BULLET) add(`${e.id}:long:${i}`, target, t.longBullet(label, i + 1))
      const key = b.trim().toLowerCase()
      if (key && seen.has(key)) add(`${e.id}:dup:${i}`, target, t.duplicate(label, seen.get(key)!))
      else if (key) seen.set(key, label)
    })
  }
  for (const d of p.education) {
    const when = dates(d.start, d.end, false)
    if (when) add(`${d.id}:${when}`, `entry-${d.id}`, t[when](d.school || d.degree || "—"))
  }
  for (const x of p.projects) {
    const label = x.name || "—"
    const when = dates(x.start, x.end, x.current)
    if (when) add(`${x.id}:${when}`, `entry-${x.id}`, t[when](label))
    if (!x.description.trim()) add(`${x.id}:description`, `entry-${x.id}`, t.noDescription(label))
  }
  return out
}
