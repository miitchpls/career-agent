/**
 * Applications, stored by the server (career_agent.applications): the postings followed or
 * applied to, each with its history of statuses, the user's notes and a copy of the posting.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type ScoreDecision, type Site } from "@/lib/api"
import { msgs } from "@/lib/i18n"

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

/** Replace one application in the cached list. */
function useReplace() {
  const client = useQueryClient()
  return (a: Application) => client.setQueryData<Application[]>(KEY, (list) => list?.map((x) => (x.id === a.id ? a : x)))
}

/** A posting tracked; resolves with it and whether it was new (else it was already tracked). */
export function useAddApplication() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.applications.add,
    onSuccess: ({ application, created }) => {
      if (created) client.setQueryData<Application[]>(KEY, (list) => [application, ...(list ?? [])])
      // Pasted text for a board posting saves it (or fills its missing text) among the postings.
      for (const key of ["jobs", "job-match", "job-saved"]) void client.invalidateQueries({ queryKey: [key] })
    },
  })
}

/** A new status, shown at once; put back if the server refuses. */
export function useSetStatus() {
  const client = useQueryClient()
  const replace = useReplace()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppStatus }) => api.applications.update(id, { status }),
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
