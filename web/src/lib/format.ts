import type { Job, Query, Scope } from "@/lib/api"
import { getLocale, intlTag, msgs } from "@/lib/i18n"

function scopeLabel(s: Scope): { where: string; modes: string | null } {
  return {
    where: s.anywhere ? msgs().common.anywhere : s.places.map((p) => p.city).join(", "),
    modes: s.modes.length ? s.modes.map((m) => msgs().modes[m]).join(" / ") : null,
  }
}

/**
 * Short salary figures: "85K"; from a million up, the language's own short form ("45M",
 * "45 Mln", "45 Mio."), which covers won and yen. A Korean UI uses 만 and 억 ("4500만").
 */
export const compact = (n: number) =>
  getLocale() === "ko" || n >= 1e6
    ? new Intl.NumberFormat(intlTag(), { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : `${Math.round(n / 1000)}K`

export function salaryLabel(job: Pick<Job, "min_amount" | "max_amount" | "currency">): string | null {
  const { min_amount: lo, max_amount: hi, currency } = job
  if (lo == null && hi == null) return null
  const cur = currency ?? ""
  if (lo != null && hi != null && lo !== hi) return `${cur} ${compact(lo)}–${compact(hi)}`.trim()
  return `${cur} ${compact((hi ?? lo)!)}`.trim()
}

export function relativeDay(iso: string | null): string {
  if (!iso) return "—"
  const then = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const rtf = new Intl.RelativeTimeFormat(intlTag(), { numeric: "auto" })
  const days = Math.round((then.getTime() - today.getTime()) / 86_400_000)
  if (days >= -6) return rtf.format(days, "day")
  if (days >= -30) return rtf.format(Math.round(days / 7), "week")
  return rtf.format(Math.round(days / 30), "month")
}

export function fullDate(iso: string | null): string {
  if (!iso) return msgs().format.noDate
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(intlTag(), {
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
        .join(msgs().format.scopeOr),
    )
  if (q.salary_min !== null) parts.push(`≥ ${q.salary_min}K`)
  return parts.join(" · ") || msgs().format.searchFallback
}

/** "5 minuti fa", "2 ore fa": for things that happened today. */
export function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return msgs().format.justNow
  const rtfShort = new Intl.RelativeTimeFormat(intlTag(), { numeric: "auto", style: "long" })
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
