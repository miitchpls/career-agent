/**
 * Tailored CVs, written by the server with the user's AI CLI (`career_agent.tailor`): one per
 * posting, polled while it's being written, downloaded as a PDF the server prints.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type CvLanguage, type CvOverrides, type CvPdfRequest, type CvPrefs, type CvState, type Job, type TailoredCv } from "@/lib/api"
import { resolveCv, useCvPrefs, type ResolvedCv } from "@/lib/cv-prefs"
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

// --- One posting's own settings -------------------------------------------------------------

export const NO_OVERRIDES: CvOverrides = {
  language: null,
  format: null,
  style: null,
  photo: null,
  photoStyle: null,
  footer: null,
  locked: null,
  notes: "",
}

/** The settings that replace a default for this posting (the footer and the notes work apart). */
const REPLACING = ["language", "format", "style", "photo", "photoStyle", "locked"] as const

/** The defaults with the posting's own settings applied, as the server applies them: the
 * footer on (wherever the posting is) or off; the notes stay apart. */
export function applyOverrides(prefs: CvPrefs, o: CvOverrides): CvPrefs {
  const out = { ...prefs } as Record<string, unknown>
  for (const k of REPLACING) if (o[k] !== null) out[k] = o[k]
  if (o.footer === true) out.footerCountries = []
  if (o.footer === false) out.footer = ""
  return out as unknown as CvPrefs
}

/** How many settings the posting changes. */
export const overrideCount = (o: CvOverrides) =>
  REPLACING.filter((k) => o[k] !== null).length + (o.footer !== null ? 1 : 0) + (o.notes ? 1 : 0)

const settingsKey = (url: string) => ["cv-settings", url]

export function useCvSettings(url: string): CvOverrides {
  return useQuery({ queryKey: settingsKey(url), queryFn: () => api.cv.settings(url), staleTime: Infinity }).data ?? NO_OVERRIDES
}

/**
 * Shown at once, saved one after the other (a scope runs them in order, so the last change
 * is the one stored). When the last one settles, what the server holds is read back, and the
 * CV's state too: a setting that steers the writing makes the finished CV stale.
 */
export function useSaveCvSettings(url: string) {
  const client = useQueryClient()
  const mutationKey = ["cv-settings-save", url]
  return useMutation({
    mutationKey,
    scope: { id: `cv-settings:${url}` },
    mutationFn: (next: CvOverrides) => api.cv.saveSettings(url, next),
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: settingsKey(url) })
      client.setQueryData(settingsKey(url), next)
    },
    onError: (e) => toast.error(msgs().profile.saveFailed, { description: e.message }),
    onSettled: () => {
      if (client.isMutating({ mutationKey }) > 1) return // a later change is on its way
      void client.invalidateQueries({ queryKey: settingsKey(url) })
      void client.invalidateQueries({ queryKey: key(url) })
    },
  })
}

/** What a CV for this posting looks like: the defaults, the posting's own settings, "auto"
 * resolved for it. */
export function useCvLook(job: Pick<Job, "url" | "location" | "description">): {
  look: ResolvedCv
  prefs: CvPrefs
  overrides: CvOverrides
} {
  const defaults = useCvPrefs()
  const overrides = useCvSettings(job.url)
  const { profile } = useProfile()
  const prefs = applyOverrides(defaults, overrides)
  return { look: resolveCv(prefs, job, !!profile.photo), prefs, overrides }
}

export type { CvPdfRequest }
