import { Loader2Icon, RadarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Query } from "@/lib/api"
import { useStartSearch } from "@/lib/use-start-search"

/**
 * Fetches new postings from the job boards for `query`. Lives on the results page:
 * the search bar only filters what's already saved; this goes out and gets more.
 */
export function StartSearchButton({
  query,
  running,
  label = "Cerca nuove offerte",
  prominent = false,
}: {
  query: Query
  running: boolean
  label?: string
  /** Filled style, for the empty results state where it's the obvious next step. */
  prominent?: boolean
}) {
  const start = useStartSearch()
  const ready = query.scopes.length > 0 && query.title_any.length > 0
  const busy = running || start.isPending
  return (
    <Button
      size="sm"
      variant={prominent ? "default" : "outline"}
      disabled={busy || !ready}
      title={ready ? "Cerca su LinkedIn e Indeed (circa 1–2 minuti)" : "Aggiungi almeno un titolo e un luogo"}
      onClick={() => start.mutate({ query })}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <RadarIcon />}
      {running ? "Ricerca in corso…" : label}
    </Button>
  )
}
