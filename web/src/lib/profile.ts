/**
 * The user's profile, saved by the backend (`/api/profile`, mirrored by `career_agent.profile`).
 * A tiny external store lets the header, the profile page and the job sheet share it.
 * Field sets follow LinkedIn's profile forms, so an import from there maps one to one.
 *
 * Saved profile and import draft are kept apart: edits to a saved profile are saved as they
 * happen; edits to a draft stay in the draft until the user confirms it.
 */
import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { api, type ProfileDraft, type ProfileState, type UploadedFile } from "@/lib/api"
import { intlTag, msgs } from "@/lib/i18n"

/**
 * loading: first fetch. empty: nothing yet (onboarding). importing / failed: an import runs
 * or just failed. review: an import's draft waits for confirmation. ready: the saved profile,
 * or one being filled in by hand.
 */
export type Stage = "loading" | "empty" | "importing" | "failed" | "review" | "ready"

/** month: 0–11, null when only the year is known. */
export interface MonthYear {
  month: number | null
  year: number
}

export interface Media {
  id: string
  kind: "image" | "document" | "link"
  title: string
  /** Object URL for files picked in the browser, address for links. */
  url?: string
}

export interface Link {
  id: string
  label: string
  url: string
}

/** Stored as keys; labels in `t.profile.employment` / `t.profile.locationType`. */
export const EMPLOYMENT = ["fulltime", "parttime", "freelance", "fixedterm", "internship", "apprenticeship"] as const
export type Employment = (typeof EMPLOYMENT)[number]
export const LOCATION_TYPES = ["onsite", "hybrid", "remote"] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export interface Experience {
  id: string
  role: string
  employment: Employment | null
  company: string
  location: string
  locationType: LocationType | null
  start: MonthYear | null
  end: MonthYear | null
  current: boolean
  bullets: string[]
  skills: string[]
  media: Media[]
  /** Set by an import: what the user should check. */
  review?: string | null
}

export interface Education {
  id: string
  school: string
  degree: string
  field: string
  start: MonthYear | null
  end: MonthYear | null
  grade: string
  activities: string
  description: string
  skills: string[]
  media: Media[]
  review?: string | null
}

export interface Skill {
  name: string
  inferred?: boolean
}

/** Either a CEFR level, for certified languages, or LinkedIn's self-assessed proficiency. */
export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const
/** LinkedIn's levels for languages without a certificate (labels: `t.profile.proficiency`). */
export const PROFICIENCY = ["elementary", "limited", "professional", "full", "native"] as const
export type Proficiency = (typeof PROFICIENCY)[number]
export type LanguageLevel = (typeof CEFR)[number] | Proficiency

export const levelLabel = (l: LanguageLevel): string =>
  (PROFICIENCY as readonly string[]).includes(l) ? msgs().profile.proficiency[l as Proficiency] : l
export const isCefr = (l: LanguageLevel) => (CEFR as readonly string[]).includes(l)

export interface Language {
  id: string
  name: string
  level: LanguageLevel
  certificate: string
}

export interface Certification {
  id: string
  name: string
  issuer: string
  issued: MonthYear | null
  expires: MonthYear | null
  credentialId: string
  url: string
  skills: string[]
  media: Media[]
  review?: string | null
}

export interface Project {
  id: string
  name: string
  description: string
  start: MonthYear | null
  end: MonthYear | null
  current: boolean
  url: string
  /** id of the experience or education it belongs to. */
  associatedWith: string | null
  skills: string[]
  media: Media[]
  review?: string | null
}

export interface Profile {
  photo: string | null
  name: string
  headline: string
  location: string
  email: string
  links: Link[]
  summary: string
  experiences: Experience[]
  education: Education[]
  skills: Skill[]
  languages: Language[]
  projects: Project[]
  certifications: Certification[]
}

export const uid = () => crypto.randomUUID()

export const EMPTY_PROFILE: Profile = {
  photo: null,
  name: "",
  headline: "",
  location: "",
  email: "",
  links: [],
  summary: "",
  experiences: [],
  education: [],
  skills: [],
  languages: [],
  projects: [],
  certifications: [],
}

// --- Formatting ------------------------------------------------------------------------------

/** Month names in the UI's language: "gen"/"Jan" (short) or "gennaio"/"January" (long). */
export function monthNames(width: "short" | "long"): string[] {
  const f = new Intl.DateTimeFormat(intlTag(), { month: width })
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(2000, i, 1)))
}

export const fmtMonthYear = (d: MonthYear | null) =>
  d ? (d.month === null ? `${d.year}` : `${monthNames("short")[d.month]} ${d.year}`) : ""

/** "mar 2022 – oggi · 4 anni 9 mesi", LinkedIn style. */
export function fmtRange(start: MonthYear | null, end: MonthYear | null, current: boolean): string {
  if (!start) return ""
  const t = msgs().profile
  const to = current ? t.present : fmtMonthYear(end)
  const range = to ? `${fmtMonthYear(start)} – ${to}` : fmtMonthYear(start)
  const stop = current ? { month: new Date().getMonth(), year: new Date().getFullYear() } : end
  if (!stop || start.month === null || stop.month === null) return range
  const months = (stop.year - start.year) * 12 + stop.month - start.month + 1
  if (months <= 0) return range
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = [y && t.years(y), m && t.months(m)].filter(Boolean)
  return `${range} · ${parts.join(" ")}`
}

// --- Skills shared between the list and the entries -------------------------------------------

export interface SkillUse {
  id: string
  label: string
  /** Labels: `t.profile.useSection`. */
  section: "experience" | "education" | "certification" | "project"
}

/** Where a skill is linked: removing it from the list removes it from these too. */
export function skillUses(p: Profile, name: string): SkillUse[] {
  const has = (skills: string[]) => skills.includes(name)
  return [
    ...p.experiences.filter((e) => has(e.skills)).map((e) => ({ id: e.id, label: `${e.role} · ${e.company}`, section: "experience" as const })),
    ...p.education.filter((e) => has(e.skills)).map((e) => ({ id: e.id, label: e.school, section: "education" as const })),
    ...p.certifications.filter((c) => has(c.skills)).map((c) => ({ id: c.id, label: c.name, section: "certification" as const })),
    ...p.projects.filter((x) => has(x.skills)).map((x) => ({ id: x.id, label: x.name, section: "project" as const })),
  ]
}

/** Skills picked inside an entry join the profile's list. */
export function withSkills(p: Profile, names: string[]): Profile {
  const known = new Set(p.skills.map((s) => s.name.toLowerCase()))
  const added = names.filter((n) => !known.has(n.toLowerCase())).map((name) => ({ name }))
  return added.length ? { ...p, skills: [...p.skills, ...added] } : p
}

export function removeSkill(p: Profile, name: string): Profile {
  const drop = (skills: string[]) => skills.filter((s) => s !== name)
  return {
    ...p,
    skills: p.skills.filter((s) => s.name !== name),
    experiences: p.experiences.map((e) => ({ ...e, skills: drop(e.skills) })),
    education: p.education.map((e) => ({ ...e, skills: drop(e.skills) })),
    certifications: p.certifications.map((c) => ({ ...c, skills: drop(c.skills) })),
    projects: p.projects.map((x) => ({ ...x, skills: drop(x.skills) })),
  }
}

/** Insert or replace an entry by id, newest first. */
export function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]
}

/** How many fields the import left for the user to check. */
export function reviewCount(p: Profile): number {
  return (
    p.experiences.filter((e) => e.review).length +
    p.education.filter((e) => e.review).length +
    p.projects.filter((x) => x.review).length +
    p.certifications.filter((c) => c.review).length +
    p.skills.filter((s) => s.inferred).length
  )
}

/** Everything marked as checked: how a confirmed draft is saved. */
export function withoutReview(p: Profile): Profile {
  return {
    ...p,
    experiences: p.experiences.map((e) => ({ ...e, review: null })),
    education: p.education.map((e) => ({ ...e, review: null })),
    projects: p.projects.map((x) => ({ ...x, review: null })),
    certifications: p.certifications.map((c) => ({ ...c, review: null })),
    skills: p.skills.map((s) => ({ ...s, inferred: false })),
  }
}

/** Rough completeness, the way job sites nudge you to finish a profile. */
export function completeness(p: Profile): { score: number; missing: string[] } {
  const t = msgs().profile.missing
  const checks: [boolean, string][] = [
    [!!p.photo, t.photo],
    [!!p.name && !!p.headline, t.name],
    [p.summary.length > 80, t.summary],
    [p.experiences.length > 0, t.experience],
    [p.experiences.every((e) => e.bullets.some((b) => /\d/.test(b))), t.numbers],
    [p.education.length > 0, t.education],
    [p.skills.length >= 5, t.skills],
    [p.languages.length > 0, t.languages],
    [p.projects.some((x) => x.url), t.project],
  ]
  const ok = checks.filter(([c]) => c).length
  return { score: Math.round((ok / checks.length) * 100), missing: checks.filter(([c]) => !c).map(([, m]) => m) }
}

// --- Store -----------------------------------------------------------------------------------

interface State {
  stage: Stage
  /** What the page shows: the draft while reviewing, the saved profile otherwise. */
  profile: Profile
  saved: Profile | null
  savedAt: string | null
  draft: ProfileDraft | null
  /** Filling in a new profile by hand: shown as ready before its first save. */
  blank: boolean
}

let state: State = { stage: "loading", profile: EMPTY_PROFILE, saved: null, savedAt: null, draft: null, blank: false }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : msgs().common.invalidRequest)

/** The server's view, merged with what only the browser knows (a blank profile in progress). */
function apply(s: ProfileState) {
  const saved = (s.profile as Profile | null) ?? null
  const draft = s.draft
  const blank = state.blank && !saved
  let stage: Stage
  if (draft?.status === "running") stage = "importing"
  else if (draft?.status === "failed") stage = "failed"
  else if (draft?.status === "ready") stage = "review"
  else stage = saved || blank ? "ready" : "empty"
  const profile =
    stage === "review" && draft?.data ? (draft.data as Profile) : (saved ?? (blank ? state.profile : EMPTY_PROFILE))
  set({ stage, profile, saved, savedAt: s.saved_at, draft, blank })
  if (stage === "importing") poll()
}

let polling: ReturnType<typeof setTimeout> | null = null

/** While an import runs, ask the server how it's going. */
function poll() {
  if (polling) return
  polling = setTimeout(async () => {
    polling = null
    if (state.stage !== "importing") return
    try {
      apply(await api.profile.get())
    } catch {
      poll() // the server may be restarting: keep asking
    }
  }, 1500)
}

/**
 * Saves one value at a time, newest wins: edits made while a save is in flight are sent
 * after it, once. `idle()` resolves when nothing is pending.
 */
function saver(send: (p: Profile) => Promise<ProfileState>, onSaved: (s: ProfileState) => void) {
  let queued: Profile | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let flight: Promise<void> | null = null

  const flush = () => {
    timer = null
    if (flight || !queued) return
    const p = queued
    queued = null
    flight = send(p)
      .then(onSaved)
      .catch((e) => {
        toast.error(msgs().profile.saveFailed, { description: errorText(e) })
      })
      .finally(() => {
        flight = null
        flush()
      })
  }
  return {
    schedule(p: Profile, delay = 0) {
      queued = p
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    /** Drop what hasn't been sent and wait for what has. */
    async cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      queued = null
      while (flight) await flight
    },
  }
}

const profileSaver = saver(api.profile.save, (s) => set({ saved: (s.profile as Profile) ?? null, savedAt: s.saved_at, blank: false }))
// Typing in the review dialogs shouldn't hit the server on every change.
const draftSaver = saver(api.profile.saveDraft, () => {})

export const profileStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,

  async load() {
    try {
      apply(await api.profile.get())
    } catch (e) {
      set({ stage: "empty" })
      toast.error(msgs().profile.loadFailed, { description: errorText(e) })
    }
  },

  /** Throws with the server's reason (no AI engine, unsupported file…). */
  async importFile(file: File) {
    apply(await api.profile.importFile(file))
  },
  async importText(text: string) {
    apply(await api.profile.importText(text))
  },
  async retryImport() {
    try {
      apply(await api.profile.retry())
    } catch (e) {
      toast.error(errorText(e))
    }
  },
  /** Stop a running import, or close a failed one. */
  async cancelImport() {
    try {
      apply(await api.profile.discard())
    } catch (e) {
      toast.error(errorText(e))
    }
  },

  /** An edit from the page: saved right away, or kept in the draft while reviewing. */
  update(profile: Profile) {
    set({ profile })
    if (state.stage === "review") draftSaver.schedule(profile, 600)
    else profileSaver.schedule(profile)
  },

  /** The user checked the draft: it becomes the profile. */
  async confirmDraft() {
    await draftSaver.cancel()
    try {
      apply(await api.profile.confirm(withoutReview(state.profile)))
      toast.success(msgs().profile.confirmed)
    } catch (e) {
      toast.error(msgs().profile.saveFailed, { description: errorText(e) })
    }
  },
  async discardDraft() {
    await draftSaver.cancel()
    await profileStore.cancelImport()
  },

  startBlank: () => set({ stage: "ready", profile: EMPTY_PROFILE, blank: true }),

  /** Delete the profile, its drafts and every uploaded file. */
  async reset() {
    await Promise.all([profileSaver.cancel(), draftSaver.cancel()])
    try {
      set({ blank: false })
      apply(await api.profile.clear())
    } catch (e) {
      toast.error(errorText(e))
    }
  },

  /** A photo or attachment, stored by the server; returns where to find it. */
  upload: (file: File): Promise<UploadedFile> => api.profile.upload(file),
}

export function useProfile(): State {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get)
}

export const hasProfile = (s: State) => s.stage === "ready" || s.stage === "review"
