/**
 * Mock profile and tailored-CV data, UI only: nothing here reaches the backend.
 * A tiny external store lets the header, the profile page and the job sheet share the mock state.
 */
import { useSyncExternalStore } from "react"

export type Stage = "empty" | "importing" | "review" | "ready"

export interface Experience {
  id: string
  role: string
  company: string
  place: string
  start: string
  end: string | null
  bullets: string[]
  review?: string
}

export interface Education {
  id: string
  school: string
  degree: string
  years: string
  review?: string
}

export interface Skill {
  name: string
  inferred?: boolean
}

export interface Language {
  name: string
  level: "Madrelingua" | "C2" | "C1" | "B2" | "B1" | "A2" | "A1"
}

export interface Project {
  id: string
  name: string
  url?: string
  summary: string
}

export interface Profile {
  name: string
  headline: string
  location: string
  email: string
  links: { label: string; url: string }[]
  summary: string
  experiences: Experience[]
  education: Education[]
  skills: Skill[]
  languages: Language[]
  projects: Project[]
  certifications: string[]
}

export const SAMPLE_PROFILE: Profile = {
  name: "Alex Moretti",
  headline: "Backend Engineer · Python e sistemi distribuiti",
  location: "Milano, Italia",
  email: "alex.moretti@example.com",
  links: [
    { label: "LinkedIn", url: "#" },
    { label: "GitHub", url: "#" },
    { label: "alexmoretti.dev", url: "#" },
  ],
  summary:
    "Backend engineer con 6 anni di esperienza su servizi Python ad alto traffico. Ho guidato la migrazione di un monolite Django verso servizi FastAPI, riducendo i tempi di risposta del 40%. Mi interessano i sistemi affidabili, l'osservabilità e i team piccoli che rilasciano spesso.",
  experiences: [
    {
      id: "e1",
      role: "Senior Backend Engineer",
      company: "Fintrail",
      place: "Milano · ibrido",
      start: "mar 2022",
      end: null,
      bullets: [
        "Migrazione del monolite Django a 9 servizi FastAPI: p95 da 820 a 490 ms.",
        "Pipeline di eventi su PostgreSQL e Redis Streams per 3 milioni di transazioni al giorno.",
        "Mentoring di 3 sviluppatori junior, revisione del processo di code review.",
      ],
      review: "Date lette dal PDF: controlla mese di inizio",
    },
    {
      id: "e2",
      role: "Backend Developer",
      company: "Borgo Digitale",
      place: "Torino · in sede",
      start: "set 2019",
      end: "feb 2022",
      bullets: [
        "API REST per l'app di prenotazioni, 200k utenti attivi al mese.",
        "Test end-to-end e CI su GitHub Actions: rilasci da settimanali a giornalieri.",
      ],
    },
    {
      id: "e3",
      role: "Software Engineer Intern",
      company: "Nodo Labs",
      place: "Torino",
      start: "feb 2019",
      end: "ago 2019",
      bullets: ["Strumenti interni in Python per l'analisi dei log."],
      review: "Tirocinio: tenerlo nel CV?",
    },
  ],
  education: [
    {
      id: "d1",
      school: "Politecnico di Torino",
      degree: "Laurea magistrale in Ingegneria Informatica",
      years: "2017 – 2019",
    },
    {
      id: "d2",
      school: "Politecnico di Torino",
      degree: "Laurea triennale in Ingegneria Informatica",
      years: "2014 – 2017",
      review: "Voto di laurea non trovato",
    },
  ],
  skills: [
    { name: "Python" },
    { name: "FastAPI" },
    { name: "Django" },
    { name: "PostgreSQL" },
    { name: "Redis" },
    { name: "Docker" },
    { name: "AWS", inferred: true },
    { name: "Kubernetes", inferred: true },
    { name: "GitHub Actions" },
    { name: "OpenTelemetry" },
  ],
  languages: [
    { name: "Italiano", level: "Madrelingua" },
    { name: "Inglese", level: "C1" },
    { name: "Tedesco", level: "A2" },
  ],
  projects: [
    {
      id: "p1",
      name: "pgqueue",
      url: "#",
      summary: "Coda di job su PostgreSQL con SKIP LOCKED, 1.2k stelle su GitHub.",
    },
  ],
  certifications: ["AWS Certified Developer – Associate"],
}

export const EMPTY_PROFILE: Profile = {
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

/** How many fields the import left for the user to check. */
export function reviewCount(p: Profile): number {
  return (
    p.experiences.filter((e) => e.review).length +
    p.education.filter((e) => e.review).length +
    p.skills.filter((s) => s.inferred).length
  )
}

/** Rough completeness, the way job sites nudge you to finish a profile. */
export function completeness(p: Profile): { score: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!p.name && !!p.headline, "nome e titolo"],
    [p.summary.length > 80, "un riepilogo di qualche riga"],
    [p.experiences.length > 0, "almeno un'esperienza"],
    [p.experiences.every((e) => e.bullets.some((b) => /\d/.test(b))), "risultati con numeri in ogni esperienza"],
    [p.education.length > 0, "la formazione"],
    [p.skills.length >= 5, "almeno 5 competenze"],
    [p.languages.length > 0, "le lingue"],
    [p.projects.some((x) => x.url), "il link a un progetto"],
  ]
  const ok = checks.filter(([c]) => c).length
  return { score: Math.round((ok / checks.length) * 100), missing: checks.filter(([c]) => !c).map(([, m]) => m) }
}

// --- Tailored CV for one posting -----------------------------------------------------------

export type MatchKind = "have" | "partial" | "gap"

export interface Tailored {
  language: string
  format: string
  version: number
  generatedAt: string
  matches: { skill: string; kind: MatchKind; why: string }[]
  changes: string[]
  summary: string
  experiences: { role: string; company: string; dates: string; bullets: { text: string; changed?: boolean }[] }[]
  skills: string[]
}

export function tailoredFor(title: string, company: string | null): Tailored {
  return {
    language: "Inglese",
    format: "A4",
    version: 1,
    generatedAt: "adesso",
    matches: [
      { skill: "Python", kind: "have", why: "6 anni, in tutte le esperienze" },
      { skill: "FastAPI", kind: "have", why: "Fintrail, migrazione dei servizi" },
      { skill: "PostgreSQL", kind: "have", why: "Fintrail e il progetto pgqueue" },
      { skill: "Event-driven", kind: "have", why: "Redis Streams a Fintrail" },
      { skill: "AWS", kind: "partial", why: "solo dalla certificazione, nessuna esperienza lo cita" },
      { skill: "Kafka", kind: "gap", why: "non compare nel profilo" },
      { skill: "Tedesco B2", kind: "gap", why: "nel profilo hai A2" },
    ],
    changes: [
      `Riepilogo riscritto per «${title}»`,
      "Esperienza Fintrail in cima, con la pipeline di eventi come primo punto",
      "Tirocinio Nodo Labs tolto per stare in una pagina",
      "Competenze riordinate: le 6 chieste dall'annuncio per prime",
    ],
    summary: `Backend engineer with 6 years building high-traffic Python services, now looking to bring event-driven and reliability work to ${company ?? "your team"}. Led a Django-to-FastAPI migration that cut p95 latency by 40%.`,
    experiences: [
      {
        role: "Senior Backend Engineer",
        company: "Fintrail · Milan",
        dates: "Mar 2022 – Present",
        bullets: [
          { text: "Built an event pipeline on PostgreSQL and Redis Streams handling 3M transactions a day.", changed: true },
          { text: "Migrated a Django monolith to 9 FastAPI services, p95 latency from 820 to 490 ms." },
          { text: "Mentored 3 junior developers and reworked the code review process." },
        ],
      },
      {
        role: "Backend Developer",
        company: "Borgo Digitale · Turin",
        dates: "Sep 2019 – Feb 2022",
        bullets: [
          { text: "Shipped REST APIs for a booking app with 200k monthly active users." },
          { text: "Moved releases from weekly to daily with end-to-end tests and CI.", changed: true },
        ],
      },
    ],
    skills: ["Python", "FastAPI", "PostgreSQL", "Event-driven systems", "Redis", "Docker", "AWS", "OpenTelemetry"],
  }
}

// --- Store -------------------------------------------------------------------------------

interface State {
  stage: Stage
  profile: Profile
  source: string | null
  /** job urls with a generated CV */
  generated: ReadonlySet<string>
}

let state: State = { stage: "empty", profile: EMPTY_PROFILE, source: null, generated: new Set() }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const profileStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,
  startImport: (source: string) => set({ stage: "importing", source }),
  finishImport: () => set({ stage: "review", profile: SAMPLE_PROFILE }),
  startBlank: () => set({ stage: "ready", profile: EMPTY_PROFILE, source: null }),
  confirm: (profile: Profile) => set({ stage: reviewCount(profile) ? "review" : "ready", profile }),
  confirmAll: () =>
    set({
      stage: "ready",
      profile: {
        ...state.profile,
        experiences: state.profile.experiences.map((e) => ({ ...e, review: undefined })),
        education: state.profile.education.map((e) => ({ ...e, review: undefined })),
        skills: state.profile.skills.map((s) => ({ ...s, inferred: false })),
      },
    }),
  reset: () => set({ stage: "empty", profile: EMPTY_PROFILE, source: null }),
  markGenerated: (url: string) => set({ generated: new Set([...state.generated, url]) }),
}

export function useProfile(): State {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get)
}

export const hasProfile = (s: State) => s.stage === "ready" || s.stage === "review"
