import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type Query, type SavedSearch } from "@/lib/api"
import { msgs } from "@/lib/i18n"

/** `force`: rerun searches made in the last hours too («Aggiorna comunque»). */
type Target = ({ query: Query } | { saved: SavedSearch }) & { force?: boolean }

/** Starts a portal search right away: pressing the button is the confirmation. */
export function useStartSearch(onStarted?: () => void) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (t: Target) => ("saved" in t ? api.saved.run(t.saved.id, t.force) : api.search(t.query, t.force)),
    onSuccess: (r, t) => {
      const m = msgs().run
      onStarted?.()
      qc.invalidateQueries({ queryKey: ["status"] })
      qc.invalidateQueries({ queryKey: ["saved"] })
      if (r.queries === 0 && !r.held) {
        toast(m.alreadyFresh, {
          description: m.alreadyFreshHint,
          // Rerunning costs board requests, so it's an explicit second step, never the default.
          action: { label: m.refreshAnyway, onClick: () => mutation.mutate({ ...t, force: true }) },
          duration: 8000,
        })
        return
      }
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
