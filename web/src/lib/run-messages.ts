import type { RunStatus, RunStep } from "@/lib/api"

const SITE: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed" }
const site = (s: RunStep) => SITE[s.site] ?? s.site
const where = (s: RunStep) => (s.place === "Ovunque" ? "ovunque" : `a ${s.place}`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "5 nuove offerte", "6 offerte, di cui 5 nuove", "5 offerte, già viste", "nessuna offerta". */
export function offersPhrase(found: number, fresh: number): string {
  if (!found) return "nessuna offerta"
  if (fresh === found) return found === 1 ? "1 nuova offerta" : `${found} nuove offerte`
  if (!fresh) return found === 1 ? "1 offerta, già vista" : `${found} offerte, già viste`
  return `${plural(found, "offerta", "offerte")}, di cui ${plural(fresh, "nuova", "nuove")}`
}

export const stepResult = (s: RunStep) => offersPhrase(s.found, s.new)

/** A finished search in one line: what it found, what it threw away, and any caveat. */
export function stepOutcome(s: RunStep): string {
  const dropped = [
    s.abroad && `${s.abroad} fuori dal paese`,
    s.off_title && `${s.off_title} con un altro titolo`,
  ].filter(Boolean)
  return [stepResult(s), dropped.length && `scartate ${dropped.join(", ")}`, s.note].filter(Boolean).join(" · ")
}

/**
 * The one-line, human status of a run (instead of raw logs). `live` = still working,
 * shown with the shimmer; otherwise it's the final summary.
 */
export function runMessage(r: RunStatus): { text: string; live: boolean } | null {
  const step = r.current !== null ? r.steps[r.current] : undefined
  switch (r.phase) {
    case "searching":
      return step ? { text: `Cerco «${step.keyword}» su ${site(step)} ${where(step)}…`, live: true } : null
    case "pausing": {
      const prev = r.steps.filter((s) => s.status === "done" || s.status === "error").at(-1)
      const next = r.steps.find((s) => s.status === "pending")
      const then = next ? ` · tra poco ${site(next)} ${where(next)}` : ""
      if (!prev) return { text: `Un attimo di pausa${then}…`, live: true }
      const what =
        prev.status === "error"
          ? `${site(prev)}: ${prev.error}`
          : prev.found
            ? `Trovate su ${site(prev)} ${stepResult(prev)}`
            : `Nessuna offerta su ${site(prev)}`
      return { text: `${what}${then}…`, live: true }
    }
    case "done": {
      const failed = r.steps.filter((s) => s.status === "error")
      if (r.steps.length && failed.length === r.steps.length)
        return { text: `Nessun portale ha risposto: ${failed[0].error}`, live: false }
      const recent = r.steps.filter((s) => s.status === "recent").length
      const held = r.steps.filter((s) => s.status === "skipped").length
      const tail = [
        failed.length && plural(failed.length, "ricerca non riuscita", "ricerche non riuscite"),
        held && plural(held, "rimandata", "rimandate"),
        recent && `${plural(recent, "già fatta", "già fatte")} di recente`,
      ]
        .filter(Boolean)
        .map((t) => ` · ${t}`)
        .join("")
      return { text: `Ricerca completata: ${offersPhrase(r.found, r.new)}${tail}`, live: false }
    }
    case "cancelled":
      return { text: `Ricerca interrotta: finora ${offersPhrase(r.found, r.new)}`, live: false }
    default:
      return null
  }
}
