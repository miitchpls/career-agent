import { Loader2Icon, RadarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Query } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { useStartSearch } from "@/lib/use-start-search"

/**
 * Fetches new postings from the job boards for `query`. Lives on the results page:
 * the search bar only filters what's already saved; this goes out and gets more.
 */
export function StartSearchButton({
  query,
  running,
  label,
  prominent = false,
}: {
  query: Query
  running: boolean
  label?: string
  /** Filled style, for the empty results state where it's the obvious next step. */
  prominent?: boolean
}) {
  const t = useT().run
  const start = useStartSearch()
  const ready = query.scopes.length > 0 && query.title_any.length > 0
  const busy = running || start.isPending
  return (
    <Button
      size="sm"
      variant={prominent ? "default" : "outline"}
      disabled={busy || !ready}
      title={ready ? t.startHint : t.startNeeds}
      onClick={() => start.mutate({ query })}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <RadarIcon />}
      {running ? t.inProgress : (label ?? t.start)}
    </Button>
  )
}
