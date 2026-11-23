import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type JobScore, type ScoreDecision, type ScorePrefs, type ScoreState } from "@/lib/api"
import { intlTag, msgs } from "@/lib/i18n"

/** 4.2 → "4,2" in Italian, "4.2" in English: always one decimal, as career-ops writes it. */
export const formatScore = (n: number) =>
  n.toLocaleString(intlTag(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Colour is for the decision only; the number stays in the text colour. */
export const DECISION_DOT: Record<ScoreDecision, string> = {
  strong_apply: "bg-emerald-500",
  apply: "bg-emerald-500",
  consider: "bg-amber-500",
  skip: "bg-red-500",
}

/** Band floors on the 1-5 scale (career_agent.score.BANDS), for the scale under the number. */
export const BAND_FLOORS = [3.0, 4.0, 4.5] as const

/** The score on screen: the latest if it finished, else the last that did. */
export const shownScore = (state: ScoreState | undefined): JobScore | null =>
  state?.score?.status === "ready" ? state.score : (state?.earlier ?? null)

const key = (url: string) => ["job-score", url]

/** A posting's score; polled while one runs. When a run ends, the list refreshes its column. */
export function useScore(url: string) {
  const client = useQueryClient()
  return useQuery({
    queryKey: key(url),
    queryFn: async () => {
      const before = client.getQueryData<ScoreState>(key(url))
      const now = await api.score.get(url)
      if (before?.score?.status === "running" && now.score?.status !== "running")
        void client.invalidateQueries({ queryKey: ["jobs"] })
      return now
    },
    refetchInterval: (q) => (q.state.data?.score?.status === "running" ? 1500 : false),
  })
}

function useScoreMutation(url: string, fn: () => Promise<ScoreState>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => {
      client.setQueryData(key(url), state)
      // The list shows each posting's last finished score.
      void client.invalidateQueries({ queryKey: ["jobs"] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export const useStartScore = (url: string) => useScoreMutation(url, () => api.score.start(url))
export const useCancelScore = (url: string) => useScoreMutation(url, () => api.score.cancel(url))

export const EMPTY_SCORE_PREFS: ScorePrefs = { dealbreakers: [], note: "" }

export function useScorePrefs() {
  const { data, isPending } = useQuery({ queryKey: ["score-prefs"], queryFn: api.scorePrefs.get, staleTime: Infinity })
  return { prefs: data ?? EMPTY_SCORE_PREFS, loading: isPending }
}

export function useSaveScorePrefs() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.scorePrefs.save,
    onSuccess: (prefs) => {
      client.setQueryData(["score-prefs"], prefs)
      // Scores depend on them: they may now be stale.
      void client.invalidateQueries({ queryKey: ["job-score"] })
    },
    onError: (e) => toast.error(msgs().profile.saveFailed, { description: e.message }),
  })
}
