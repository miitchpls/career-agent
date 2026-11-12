import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type Query, type SavedSearch } from "@/lib/api"

type Target = { query: Query } | { saved: SavedSearch }

/** Starts a portal search right away: pressing the button is the confirmation. */
export function useStartSearch(onStarted?: () => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: Target) => ("saved" in t ? api.saved.run(t.saved.id) : api.search(t.query)),
    onSuccess: (r) => {
      onStarted?.()
      qc.invalidateQueries({ queryKey: ["status"] })
      qc.invalidateQueries({ queryKey: ["saved"] })
      if (r.queries === 0 && !r.held) {
        toast("Già aggiornata", {
          description: "Queste ricerche sono state fatte nelle ultime ore: le offerte sono già qui sotto.",
        })
        return
      }
      // Progress shows inline on the results page; only searches that won't run need a heads-up.
      if (r.held)
        toast.warning(r.queries ? `${r.held} ${r.held === 1 ? "ricerca rimandata" : "ricerche rimandate"}` : "Nessuna ricerca partita", {
          description: r.held_reasons.join("; "),
        })
      if (r.skipped) toast(`${r.skipped} ${r.skipped === 1 ? "ricerca saltata" : "ricerche saltate"}`, { description: r.skip_reasons.join("; ") })
    },
    onError: (e) => toast.error(e.message),
  })
}
