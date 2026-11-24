/**
 * Applications, mocked: a UI preview until the server keeps them. Status changes are saved in
 * localStorage, so the preview survives a reload.
 */
import { useSyncExternalStore } from "react"

import type { ScoreDecision, Site } from "@/lib/api"
import { postingKey } from "@/lib/job-link"

/** Where an application stands. `saved`: scored or followed, not sent yet. */
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
  id: string
  title: string
  company: string
  location: string
  /** "other": added by hand from another site (or no link at all). */
  site: Site | "other"
  /** "" when added from text without a link. */
  url: string
  score: { value: number; decision: ScoreDecision } | null
  /** The CV template used, once applied. */
  cv: string | null
  /** Oldest first; the last one is the current status. */
  events: AppEvent[]
}

export const statusOf = (a: Application): AppStatus => a.events[a.events.length - 1].status
export const lastActivity = (a: Application): string => a.events[a.events.length - 1].at

const day = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * day).toISOString()

type Seed = [string, string, string, Site, number | null, string | null, [AppStatus, number][]]

// title, company, location, site, score, cv, events as [status, days ago]
const SEEDS: Seed[] = [
  ["Senior Backend Engineer", "Acme", "Zurigo", "linkedin", 4.2, "Moderno", [["saved", 34], ["applied", 33], ["screening", 26], ["interview", 19], ["offer", 6]]],
  ["Platform Engineer", "Globex", "Remoto", "linkedin", 4.6, "Standard", [["saved", 40], ["applied", 39], ["screening", 31], ["interview", 24], ["offer", 9]]],
  ["Go Developer", "Initech", "Lugano", "indeed", 3.9, "Compatto", [["saved", 28], ["applied", 27], ["screening", 20], ["interview", 12]]],
  ["Staff Software Engineer", "Umbrella", "Milano", "linkedin", 4.0, "Moderno", [["saved", 45], ["applied", 44], ["screening", 37], ["interview", 30], ["rejected", 22]]],
  ["Backend Engineer, Payments", "Hooli", "Remoto", "linkedin", 3.7, "Standard", [["saved", 38], ["applied", 37], ["screening", 30], ["interview", 21], ["rejected", 14]]],
  ["Site Reliability Engineer", "Vandelay", "Zurigo", "indeed", 3.5, "Standard", [["saved", 26], ["applied", 25], ["screening", 17], ["interview", 8]]],
  ["Data Engineer", "Stark Industries", "Lugano", "linkedin", 3.4, "Compatto", [["saved", 33], ["applied", 32], ["screening", 24], ["rejected", 18]]],
  ["Software Engineer II", "Wayne Corp", "Remoto", "linkedin", 3.8, "Moderno", [["saved", 30], ["applied", 29], ["screening", 21], ["rejected", 15]]],
  ["Backend Developer", "Soylent", "Bellinzona", "indeed", 3.1, "Standard", [["saved", 22], ["applied", 21], ["screening", 11], ["rejected", 4]]],
  ["Cloud Engineer", "Tyrell", "Zugo", "linkedin", 3.6, "Standard", [["saved", 12], ["applied", 11], ["screening", 3]]],
  ["Python Developer", "Cyberdyne", "Remoto", "indeed", 2.9, "Compatto", [["saved", 40], ["applied", 39], ["rejected", 35]]],
  ["Golang Engineer", "Oscorp", "Milano", "linkedin", 3.3, "Standard", [["saved", 36], ["applied", 35], ["rejected", 30]]],
  ["Full Stack Engineer", "Massive Dynamic", "Remoto", "linkedin", 3.0, "Moderno", [["saved", 31], ["applied", 30], ["rejected", 27]]],
  ["Backend Engineer", "Pied Piper", "Lugano", "linkedin", 3.6, "Standard", [["saved", 42], ["applied", 41], ["ghosted", 20]]],
  ["API Engineer", "Monsters Inc", "Zurigo", "indeed", 3.2, "Compatto", [["saved", 37], ["applied", 36], ["ghosted", 15]]],
  ["Integration Engineer", "Aperture", "Remoto", "indeed", 2.8, "Standard", [["saved", 33], ["applied", 32], ["ghosted", 11]]],
  ["DevOps Engineer", "Black Mesa", "Lugano", "linkedin", 3.5, "Standard", [["saved", 9], ["applied", 8]]],
  ["Backend Engineer, Search", "Nakatomi", "Remoto", "linkedin", 4.1, "Moderno", [["saved", 5], ["applied", 4]]],
  ["Software Engineer", "Gringotts", "Ginevra", "linkedin", 3.3, "Standard", [["saved", 20], ["applied", 19], ["screening", 13], ["withdrawn", 7]]],
  ["Senior Go Engineer", "Weyland", "Remoto", "linkedin", 4.4, null, [["saved", 2]]],
  ["Backend Lead", "Duff", "Lugano", "indeed", 3.9, null, [["saved", 3]]],
  ["Platform Developer", "Prestige", "Zurigo", "linkedin", null, null, [["saved", 1]]],
  ["Infrastructure Engineer", "Sirius", "Remoto", "linkedin", 3.2, null, [["saved", 6]]],
  ["Engineering Manager", "Virtucon", "Milano", "indeed", 2.6, null, [["saved", 8]]],
]

function decisionFor(v: number): ScoreDecision {
  return v >= 4.5 ? "strong_apply" : v >= 4 ? "apply" : v >= 3 ? "consider" : "skip"
}

export function example(): Application[] {
  return SEEDS.map(([title, company, location, site, score, cv, events], i) => ({
    id: `app-${i + 1}`,
    title,
    company,
    location,
    site,
    url: site === "linkedin" ? `https://www.linkedin.com/jobs/view/40000${String(i).padStart(5, "0")}` : `https://www.indeed.com/viewjob?jk=${(0xabc000 + i).toString(16)}`,
    score: score === null ? null : { value: score, decision: decisionFor(score) },
    cv,
    events: events.map(([status, d]) => ({ status, at: ago(d) })),
  }))
}

// --- Store ---------------------------------------------------------------------------------

const KEY = "applications-mock"
let apps: Application[] = load()
const listeners = new Set<() => void>()

function load(): Application[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Application[]
  } catch {
    // no storage, or unreadable: the example
  }
  return example()
}

function commit(next: Application[]) {
  apps = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // private mode: keep it in memory
  }
  listeners.forEach((l) => l())
}

export const applicationsStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => apps,
  /** One added by hand, at the top of the list; its first status is dated now. */
  add(a: Omit<Application, "id" | "events">, status: AppStatus): string {
    const id = `app-${Date.now().toString(36)}`
    commit([{ ...a, id, events: [{ status, at: new Date().toISOString() }] }, ...apps])
    return id
  },
  /** The application already following this posting, if any. */
  byUrl: (url: string) => (url ? apps.find((a) => sameUrl(a.url, url)) : undefined),
  /** A new status, dated now. The same status again changes nothing. */
  setStatus(id: string, status: AppStatus) {
    commit(apps.map((a) => (a.id === id && statusOf(a) !== status ? { ...a, events: [...a.events, { status, at: new Date().toISOString() }] } : a)))
  },
}

/** Same posting, whatever the form of its link or its tracking parameters. */
export const sameUrl = (a: string, b: string) => postingKey(a) === postingKey(b)

export function useApplications(): Application[] {
  return useSyncExternalStore(applicationsStore.subscribe, applicationsStore.get)
}

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
