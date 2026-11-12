import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

import type { RunStatus } from "@/lib/api"

/** Keeps the jobs list fresh while a run is going, and once more when it ends. */
export function useRunEffects(status: RunStatus | undefined) {
  const qc = useQueryClient()
  const prev = useRef<RunStatus | undefined>(undefined)
  useEffect(() => {
    const before = prev.current
    prev.current = status
    if (!status || !before) return
    if (status.new !== before.new || status.done_steps !== before.done_steps) {
      qc.invalidateQueries({ queryKey: ["jobs"] })
    }
    if (before.running && !status.running) {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      qc.invalidateQueries({ queryKey: ["saved"] })
    }
  }, [status, qc])
}
