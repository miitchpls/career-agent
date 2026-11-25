/**
 * Tailored CVs, written by the server with the user's AI CLI (`career_agent.tailor`): one per
 * posting, polled while it's being written, downloaded as a PDF the server prints.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type CvLanguage, type CvPdfRequest, type CvState, type Job, type TailoredCv } from "@/lib/api"
import { msgs } from "@/lib/i18n"
import { hasProfile, useProfile } from "@/lib/profile"
import { activeEngine, useAiEngines } from "@/lib/use-ai"

const key = (url: string) => ["job-cv", url]

/** The CV on screen: the latest if it finished, else the last that did. */
export const shownCv = (state: CvState | undefined): TailoredCv | null =>
  state?.cv?.status === "ready" ? state.cv : (state?.earlier ?? null)

/** Lists and counters that show which postings have a CV. */
const AFFECTED = ["jobs", "cv-count", "applications"]

/** A posting's CV; polled while one is being written. When a run ends, the lists refresh. */
export function useTailoredCv(url: string, enabled = true) {
  const client = useQueryClient()
  return useQuery({
    queryKey: key(url),
    queryFn: async () => {
      const before = client.getQueryData<CvState>(key(url))
      const now = await api.cv.get(url)
      if (before?.cv?.status === "running" && now.cv?.status !== "running")
        for (const k of AFFECTED) void client.invalidateQueries({ queryKey: [k] })
      return now
    },
    enabled,
    refetchInterval: (q) => (q.state.data?.cv?.status === "running" ? 1500 : false),
  })
}

function useCvMutation<V>(url: string, fn: (v: V) => Promise<CvState>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => client.setQueryData(key(url), state),
    onError: (e) => toast.error(e.message),
  })
}

export const useStartCv = (url: string) => useCvMutation(url, (language: CvLanguage) => api.cv.start(url, language))
export const useCancelCv = (url: string) => useCvMutation(url, () => api.cv.cancel(url))

/** How many postings have a finished CV. */
export function useCvCount(): number {
  return useQuery({ queryKey: ["cv-count"], queryFn: api.cv.count, staleTime: 30_000 }).data?.postings ?? 0
}

/** Whether a CV can be written now: a profile, an AI engine and the posting's text. */
export function useCanTailor(job: Pick<Job, "description">): boolean {
  const engine = activeEngine(useAiEngines().data)
  return hasProfile(useProfile()) && !!engine && !!job.description?.trim()
}

/** The PDF, saved by the browser under the name the server gives it. */
export function useDownloadCv() {
  return useMutation({
    mutationFn: api.cv.pdf,
    onSuccess: ({ blob, filename }) => {
      const href = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = href
      a.download = filename
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 10_000)
    },
    onError: (e) => toast.error(msgs().cv.pdfFailed, { description: e.message }),
  })
}

export type { CvPdfRequest }
