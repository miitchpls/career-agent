import type { Job, Query, Scope } from "@/lib/api"
import { MODE_LABEL } from "@/lib/filters"

function scopeLabel(s: Scope): { where: string; modes: string | null } {
  return {
    where: s.anywhere ? "Ovunque" : s.places.map((p) => p.city).join(", "),
    modes: s.modes.length ? s.modes.map((m) => MODE_LABEL[m]).join(" / ") : null,
  }
}

const compact = (n: number) => `${Math.round(n / 1000)}K`

export function salaryLabel(job: Pick<Job, "min_amount" | "max_amount" | "currency">): string | null {
  const { min_amount: lo, max_amount: hi, currency } = job
  if (lo == null && hi == null) return null
  const cur = currency ?? ""
  if (lo != null && hi != null && lo !== hi) return `${cur} ${compact(lo)}–${compact(hi)}`.trim()
  return `${cur} ${compact((hi ?? lo)!)}`.trim()
}

const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" })

export function relativeDay(iso: string | null): string {
  if (!iso) return "—"
  const then = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((then.getTime() - today.getTime()) / 86_400_000)
  if (days >= -6) return rtf.format(days, "day")
  if (days >= -30) return rtf.format(Math.round(days / 7), "week")
  return rtf.format(Math.round(days / 30), "month")
}

export function fullDate(iso: string | null): string {
  if (!iso) return "Data non disponibile"
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/** Short human name for a query, used as the default name when saving. */
export function querySummary(q: Query): string {
  const parts: string[] = []
  if (q.title_any.length) parts.push(q.title_any.join(" / "))
  if (q.scopes.length)
    parts.push(
      q.scopes
        .map((s) => {
          const { where, modes } = scopeLabel(s)
          return modes ? `${where} (${modes.toLowerCase()})` : where
        })
        .join(" o "),
    )
  if (q.salary_min !== null) parts.push(`≥ ${q.salary_min}K`)
  return parts.join(" · ") || "Ricerca"
}

const rtfShort = new Intl.RelativeTimeFormat("it", { numeric: "auto", style: "long" })

/** "5 minuti fa", "2 ore fa": for things that happened today. */
export function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "poco fa"
  if (minutes < 60) return rtfShort.format(-minutes, "minute")
  return rtfShort.format(-Math.round(minutes / 60), "hour")
}

/** "≈ 95K EUR" for a salary converted into the filter's currency. */
export function convertedLabel(c: Job["salary_converted"]): string | null {
  if (!c) return null
  const { min, max, currency } = c
  if (min != null && max != null && Math.round(min / 1000) !== Math.round(max / 1000))
    return `≈ ${compact(min)}–${compact(max)} ${currency}`
  const v = max ?? min
  return v == null ? null : `≈ ${compact(v)} ${currency}`
}
