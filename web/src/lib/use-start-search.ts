import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type Query, type SavedSearch, type SearchOptions } from "@/lib/api"
import { msgs } from "@/lib/i18n"

/** `more`: the next page of each search («Mostra altre»); `force`: the first pages again («Aggiorna»). */
type Target = ({ query: Query } | { saved: SavedSearch }) & SearchOptions

/** Starts a portal search right away: pressing the button is the confirmation. */
export function useStartSearch(onStarted?: () => void) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (t: Target) => ("saved" in t ? api.saved.run(t.saved.id, t) : api.search(t.query, t)),
    onSuccess: (r) => {
      const m = msgs().run
      onStarted?.()
      qc.invalidateQueries({ queryKey: ["status"] })
      qc.invalidateQueries({ queryKey: ["saved"] })
      // Everything cached: the results are already there, and «Aggiorna» reads them again.
      qc.invalidateQueries({ queryKey: ["jobs"] })
      // Progress shows inline on the results page; only searches that won't run need a heads-up.
      if (r.held)
        toast.warning(r.queries ? m.heldToast(r.held) : m.noneStarted, {
          description: r.held_reasons.join("; "),
        })
      if (r.skipped) toast(m.skippedToast(r.skipped), { description: r.skip_reasons.join("; ") })
    },
    onError: (e) => toast.error(e.message),
  })
  return mutation
}
