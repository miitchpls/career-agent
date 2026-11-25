/**
 * Applications, stored by the server (career_agent.applications): the postings followed or
 * applied to, each with its history of statuses, the user's notes and a copy of the posting.
 */
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type CvTemplate, type ScoreDecision, type Site } from "@/lib/api"
import { useCvPrefs } from "@/lib/cv-prefs"
import { msgs } from "@/lib/i18n"
import { postingKey } from "@/lib/job-link"
import { shownCv, useTailoredCv } from "@/lib/tailored-cv"

/** Where an application stands. `saved`: followed, not sent yet. */
export type AppStatus = "saved" | "applied" | "screening" | "interview" | "offer" | "rejected" | "ghosted" | "withdrawn"

export const STATUSES: AppStatus[] = ["saved", "applied", "screening", "interview", "offer", "rejected", "ghosted", "withdrawn"]

/** The steps an application climbs; the other statuses end it. */
export const STEPS = ["applied", "screening", "interview", "offer"] as const
export type Step = (typeof STEPS)[number]

export type AppGroup = "all" | "saved" | "active" | "offer" | "closed"
export const GROUP_OF: Record<AppStatus, Exclude<AppGroup, "all">> = {
  saved: "saved",
  applied: "active",
  screening: "active",
  interview: "active",
  offer: "offer",
  rejected: "closed",
  ghosted: "closed",
  withdrawn: "closed",
}

export interface AppEvent {
  status: AppStatus
  at: string // ISO
}

export interface Application {
  id: number
  title: string
  company: string
  location: string
  /** "other": added by hand from another site (or no link at all). */
  site: Site | "other"
  /** The board's canonical address for LinkedIn and Indeed; "" when added without a link. */
  url: string
  /** The posting's last finished fit score. */
  score: { value: number; decision: ScoreDecision } | null
  /** The CV template sent, if known. */
  cv: string | null
  /** The posting's text as it was when added: it outlives the posting and the saved ones. */
  posting: { description: string; savedAt: string } | null
  notes: string
  /** Oldest first; the last one is the current status. */
  events: AppEvent[]
}

export interface NewApplication {
  url: string
  title: string
  company: string
  location: string
  description: string
  status: AppStatus
  /** The CV template sent, when one was generated for the posting. */
  cv?: string | null
}

export const statusOf = (a: Application): AppStatus => a.events[a.events.length - 1].status
export const lastActivity = (a: Application): string => a.events[a.events.length - 1].at

// --- Figures -------------------------------------------------------------------------------

/** The steps an application actually went through (indexes in STEPS), in order. */
export function visited(a: Application): number[] {
  const seen = new Set(a.events.map((e) => STEPS.indexOf(e.status as Step)).filter((i) => i >= 0))
  return [...seen].sort((x, y) => x - y)
}

/** Whether it was sent: it went through at least one step (the status can jump past "applied"). */
export const wasSent = (a: Application) => visited(a).length > 0

export function summary(list: Application[]) {
  const sent = list.filter(wasSent)
  const went = (a: Application, i: number) => visited(a).includes(i)
  return {
    sent: sent.length,
    // A reply: any step past sending, or a rejection; silence isn't one.
    answered: sent.filter((a) => visited(a).some((i) => i >= 1) || statusOf(a) === "rejected").length,
    // Only those that had one: a status moved straight to "offer" didn't go through an interview.
    interviews: sent.filter((a) => went(a, 2)).length,
    offers: sent.filter((a) => went(a, 3)).length,
  }
}

// --- Server state --------------------------------------------------------------------------

const KEY = ["applications"]

export function useApplications() {
  return useQuery({ queryKey: KEY, queryFn: api.applications.list })
}

// One index per list, however many rows ask: built once, dropped with the list.
const indexes = new WeakMap<Application[], Map<string, Application>>()
const NO_APPS: Application[] = []

function indexOf(list: Application[]): Map<string, Application> {
  let index = indexes.get(list)
  if (!index) {
    index = new Map(list.filter((a) => a.url).map((a) => [postingKey(a.url), a]))
    indexes.set(list, index)
  }
  return index
}

/** Applications by posting key: whether a posting is tracked, whatever form its link takes. */
export function useApplicationIndex(): Map<string, Application> {
  return indexOf(useApplications().data ?? NO_APPS)
}

/**
 * The application tracking this posting, if any; `known`: whether the list has arrived, so
 * that "not tracked" is an answer and not just a list still loading (or failed).
 */
export function useApplicationFor(url: string): { application: Application | undefined; known: boolean } {
  const { data } = useApplications()
  return { application: data ? indexOf(data).get(postingKey(url)) : undefined, known: !!data }
}

const ADD_KEY = ["applications", "add"]

/** Whether this posting is being added, from wherever it was asked (sheet button, nudge). */
export function useAdding(url: string): boolean {
  const key = postingKey(url)
  const pending = useMutationState({
    filters: { mutationKey: ADD_KEY, status: "pending" },
    select: (m) => (m.state.variables as NewApplication | undefined)?.url ?? "",
  })
  return pending.some((u) => postingKey(u) === key)
}

/** Replace one application in the cached list. */
function useReplace() {
  const client = useQueryClient()
  return (a: Application) => client.setQueryData<Application[]>(KEY, (list) => list?.map((x) => (x.id === a.id ? a : x)))
}

/** A posting tracked; resolves with it and whether it was new (else it was already tracked). */
export function useAddApplication() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ADD_KEY,
    mutationFn: api.applications.add,
    onSuccess: ({ application, created }) => {
      if (created) client.setQueryData<Application[]>(KEY, (list) => [application, ...(list ?? [])])
      // Pasted text for a board posting saves it (or fills its missing text) among the postings.
      for (const key of ["jobs", "job-match", "job-saved"]) void client.invalidateQueries({ queryKey: [key] })
    },
  })
}

/**
 * A new status, shown at once; put back if the server refuses. `cv`: the CV sent with it, for
 * one followed first and sent now (the server keeps the first one it's told).
 */
export function useSetStatus() {
  const client = useQueryClient()
  const replace = useReplace()
  return useMutation({
    mutationFn: ({ id, status, cv }: { id: number; status: AppStatus; cv?: string | null }) =>
      api.applications.update(id, cv ? { status, cv } : { status }),
    onMutate: async ({ id, status }) => {
      // A refetch landing now would put the old status back.
      await client.cancelQueries({ queryKey: KEY })
      const before = client.getQueryData<Application[]>(KEY)
      client.setQueryData<Application[]>(KEY, (list) =>
        list?.map((a) =>
          a.id === id && statusOf(a) !== status ? { ...a, events: [...a.events, { status, at: new Date().toISOString() }] } : a,
        ),
      )
      return { before }
    },
    onError: (e, _v, ctx) => {
      client.setQueryData(KEY, ctx?.before)
      toast.error(msgs().applications.saveFailed, { description: e.message })
    },
    onSuccess: replace,
  })
}

/** Notes or a copy of the posting. */
export function useUpdateApplication() {
  const replace = useReplace()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number; notes?: string; posting?: string }) => api.applications.update(id, patch),
    onSuccess: replace,
    onError: (e) => toast.error(msgs().applications.saveFailed, { description: e.message }),
  })
}

export function useDeleteApplication() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.applications.remove(id).then(() => id),
    onSuccess: (id) => client.setQueryData<Application[]>(KEY, (list) => list?.filter((a) => a.id !== id)),
    onError: (e) => toast.error(e.message),
  })
}

// --- The CV sent ---------------------------------------------------------------------------

/** The CV template (its id) to record as sent with this posting: the one its CV is shown in. */
export function useCvToSend(url: string): CvTemplate | null {
  const cv = shownCv(useTailoredCv(url, !!url).data)
  const style = useCvPrefs().style
  return cv ? style : null
}

/**
 * The same, asked when needed: a list's status menu doesn't load every row's CV, it asks
 * (or reuses what's loaded) when a status is picked.
 */
export function useFetchCvToSend(): (url: string) => Promise<CvTemplate | null> {
  const client = useQueryClient()
  const style = useCvPrefs().style
  return async (url) => {
    if (!url) return null
    try {
      const state = await client.fetchQuery({ queryKey: ["job-cv", url], queryFn: () => api.cv.get(url), staleTime: 10_000 })
      return shownCv(state) ? style : null
    } catch {
      return null // not knowing which CV went out never blocks the status change
    }
  }
}

/** The CV sent, by name in the current language; one recorded by name (older ones) as it is. */
export function cvName(cv: string): string {
  const templates = msgs().cv.templates as Record<string, { name: string } | undefined>
  return templates[cv]?.name ?? cv
}
