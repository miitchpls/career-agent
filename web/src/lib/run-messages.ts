import type { RunStatus, RunStep } from "@/lib/api"
import { msgs } from "@/lib/i18n"

const SITE: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed" }
const site = (s: RunStep) => SITE[s.site] ?? s.site
/** The server names an unrestricted search "Ovunque" (a sentinel, not display text). */
export const ANYWHERE = "Ovunque"
const where = (s: RunStep) => msgs().run.where(s.place === ANYWHERE ? null : s.place)

/** "5 nuove offerte", "6 offerte, di cui 5 nuove", "5 offerte, già viste", "nessuna offerta". */
export function offersPhrase(found: number, fresh: number): string {
  return msgs().run.offers(found, fresh)
}

export const stepResult = (s: RunStep) => offersPhrase(s.found, s.new)

/** A finished search in one line: what it found, what it threw away, and any caveat. */
export function stepOutcome(s: RunStep): string {
  const t = msgs().run
  const dropped = [s.abroad && t.abroad(s.abroad), s.off_title && t.offTitle(s.off_title)].filter(Boolean)
  return [stepResult(s), dropped.length && t.dropped(dropped.join(", ")), s.note].filter(Boolean).join(" · ")
}

/**
 * The one-line, human status of a run (instead of raw logs). `live` = still working,
 * shown with the shimmer; otherwise it's the final summary.
 */
export function runMessage(r: RunStatus): { text: string; live: boolean } | null {
  const t = msgs().run
  const step = r.current !== null ? r.steps[r.current] : undefined
  switch (r.phase) {
    case "searching":
      return step ? { text: t.searching(step.keyword, site(step), where(step)), live: true } : null
    case "pausing": {
      const prev = r.steps.filter((s) => s.status === "done" || s.status === "error").at(-1)
      const next = r.steps.find((s) => s.status === "pending")
      const then = next ? t.next(site(next), where(next)) : ""
      if (!prev) return { text: t.pause(then), live: true }
      const what =
        prev.status === "error"
          ? `${site(prev)}: ${prev.error}`
          : prev.found
            ? t.foundOn(site(prev), stepResult(prev))
            : t.noneOn(site(prev))
      return { text: `${what}${then}…`, live: true }
    }
    case "done": {
      const failed = r.steps.filter((s) => s.status === "error")
      if (r.steps.length && failed.length === r.steps.length)
        return { text: t.allFailed(failed[0].error ?? ""), live: false }
      const recent = r.steps.filter((s) => s.status === "recent").length
      const held = r.steps.filter((s) => s.status === "skipped").length
      const tail = [
        failed.length && t.failed(failed.length),
        held && t.held(held),
        recent && t.recent(recent),
      ]
        .filter(Boolean)
        .map((x) => ` · ${x}`)
        .join("")
      return { text: `${t.done(offersPhrase(r.found, r.new))}${tail}`, live: false }
    }
    case "cancelled":
      return { text: t.cancelled(offersPhrase(r.found, r.new)), live: false }
    default:
      return null
  }
}
