import { Loader2Icon, RadarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Order, Query } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { useStartSearch } from "@/lib/use-start-search"

/**
 * Reads the first page of each of `query`'s board searches that isn't cached: what the
 * results show comes from there.
 */
export function StartSearchButton({
  query,
  order,
  running,
  label,
  prominent = false,
}: {
  query: Query
  order: Order
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
      onClick={() => start.mutate({ query, order })}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <RadarIcon />}
      {running ? t.inProgress : (label ?? t.start)}
    </Button>
  )
}
