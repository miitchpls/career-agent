/**
 * Mock profile and tailored-CV data, UI only: nothing here reaches the backend.
 * A tiny external store lets the header, the profile page and the job sheet share the mock state.
 * Field sets follow LinkedIn's profile forms, so an import from there maps one to one.
 */
import { useSyncExternalStore } from "react"

export type Stage = "empty" | "importing" | "review" | "ready"

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

export const EMPLOYMENT = ["Tempo pieno", "Part-time", "Freelance", "Contratto a termine", "Tirocinio", "Apprendistato"] as const
export type Employment = (typeof EMPLOYMENT)[number]
export const LOCATION_TYPES = ["In sede", "Ibrido", "Da remoto"] as const
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
  review?: string
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
  review?: string
}

export interface Skill {
  name: string
  inferred?: boolean
}

/** Either a CEFR level, for certified languages, or LinkedIn's self-assessed proficiency. */
export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const
export const PROFICIENCY = {
  elementary: "Conoscenza elementare",
  limited: "Conoscenza professionale limitata",
  professional: "Conoscenza professionale",
  full: "Conoscenza professionale completa",
  native: "Madrelingua o bilingue",
} as const
export type LanguageLevel = (typeof CEFR)[number] | keyof typeof PROFICIENCY

export const levelLabel = (l: LanguageLevel): string => (l in PROFICIENCY ? PROFICIENCY[l as keyof typeof PROFICIENCY] : l)
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
const my = (month: number | null, year: number): MonthYear => ({ month, year })

export const SAMPLE_PROFILE: Profile = {
  photo: null,
  name: "Alex Moretti",
  headline: "Backend Engineer · Python e sistemi distribuiti",
  location: "Milano, Italia",
  email: "alex.moretti@example.com",
  links: [
    { id: "l1", label: "LinkedIn", url: "https://linkedin.com/in/alexmoretti" },
    { id: "l2", label: "GitHub", url: "https://github.com/alexmoretti" },
    { id: "l3", label: "Sito personale", url: "https://alexmoretti.dev" },
  ],
  summary:
    "Backend engineer con 6 anni di esperienza su servizi Python ad alto traffico. Ho guidato la migrazione di un monolite Django verso servizi FastAPI, riducendo i tempi di risposta del 40%. Mi interessano i sistemi affidabili, l'osservabilità e i team piccoli che rilasciano spesso.",
  experiences: [
    {
      id: "e1",
      role: "Senior Backend Engineer",
      employment: "Tempo pieno",
      company: "Fintrail",
      location: "Milano",
      locationType: "Ibrido",
      start: my(2, 2022),
      end: null,
      current: true,
      bullets: [
        "Migrazione del monolite Django a 9 servizi FastAPI: p95 da 820 a 490 ms.",
        "Pipeline di eventi su PostgreSQL e Redis Streams per 3 milioni di transazioni al giorno.",
        "Mentoring di 3 sviluppatori junior, revisione del processo di code review.",
      ],
      skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "Kubernetes"],
      media: [
        { id: "m1", kind: "document", title: "Architettura pipeline eventi.pdf" },
        { id: "m2", kind: "link", title: "Talk a PyCon Italia 2025", url: "https://example.com" },
      ],
      review: "Date lette dal PDF: controlla il mese di inizio",
    },
    {
      id: "e2",
      role: "Backend Developer",
      employment: "Tempo pieno",
      company: "Borgo Digitale",
      location: "Torino",
      locationType: "In sede",
      start: my(8, 2019),
      end: my(1, 2022),
      current: false,
      bullets: [
        "API REST per l'app di prenotazioni, 200k utenti attivi al mese.",
        "Test end-to-end e CI su GitHub Actions: rilasci da settimanali a giornalieri.",
      ],
      skills: ["Python", "Django", "GitHub Actions"],
      media: [],
    },
    {
      id: "e3",
      role: "Software Engineer Intern",
      employment: "Tirocinio",
      company: "Nodo Labs",
      location: "Torino",
      locationType: "In sede",
      start: my(1, 2019),
      end: my(7, 2019),
      current: false,
      bullets: ["Strumenti interni in Python per l'analisi dei log."],
      skills: ["Python"],
      media: [],
      review: "Tirocinio breve: tenerlo nel CV?",
    },
  ],
  education: [
    {
      id: "d1",
      school: "Politecnico di Torino",
      degree: "Laurea magistrale",
      field: "Ingegneria Informatica",
      start: my(8, 2017),
      end: my(9, 2019),
      grade: "110/110",
      activities: "Team di robotica PoliTo, tutor di Programmazione",
      description: "Tesi sui sistemi di code distribuite con garanzie exactly-once.",
      skills: ["Sistemi distribuiti"],
      media: [{ id: "m3", kind: "document", title: "Tesi magistrale.pdf" }],
    },
    {
      id: "d2",
      school: "Politecnico di Torino",
      degree: "Laurea triennale",
      field: "Ingegneria Informatica",
      start: my(8, 2014),
      end: my(6, 2017),
      grade: "",
      activities: "",
      description: "",
      skills: [],
      media: [],
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
    { name: "Sistemi distribuiti" },
  ],
  languages: [
    { id: "g1", name: "Italiano", level: "native", certificate: "" },
    { id: "g2", name: "Inglese", level: "C1", certificate: "IELTS Academic 7.5" },
    { id: "g3", name: "Tedesco", level: "elementary", certificate: "" },
  ],
  projects: [
    {
      id: "p1",
      name: "pgqueue",
      description: "Coda di job su PostgreSQL con SKIP LOCKED, 1.2k stelle su GitHub.",
      start: my(4, 2023),
      end: null,
      current: true,
      url: "https://github.com/alexmoretti/pgqueue",
      associatedWith: null,
      skills: ["Python", "PostgreSQL"],
      media: [],
    },
  ],
  certifications: [
    {
      id: "c1",
      name: "AWS Certified Developer – Associate",
      issuer: "Amazon Web Services",
      issued: my(5, 2024),
      expires: my(5, 2027),
      credentialId: "AWS-DVA-123456",
      url: "https://example.com",
      skills: ["AWS"],
      media: [],
    },
  ],
}

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

export const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"]
export const MONTHS_LONG = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
]

export const fmtMonthYear = (d: MonthYear | null) => (d ? (d.month === null ? `${d.year}` : `${MONTHS[d.month]} ${d.year}`) : "")

/** "mar 2022 – oggi · 4 anni 9 mesi", LinkedIn style. */
export function fmtRange(start: MonthYear | null, end: MonthYear | null, current: boolean): string {
  if (!start) return ""
  const to = current ? "oggi" : fmtMonthYear(end)
  const range = to ? `${fmtMonthYear(start)} – ${to}` : fmtMonthYear(start)
  const stop = current ? { month: new Date().getMonth(), year: new Date().getFullYear() } : end
  if (!stop || start.month === null || stop.month === null) return range
  const months = (stop.year - start.year) * 12 + stop.month - start.month + 1
  if (months <= 0) return range
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = [y && (y === 1 ? "1 anno" : `${y} anni`), m && (m === 1 ? "1 mese" : `${m} mesi`)].filter(Boolean)
  return `${range} · ${parts.join(" ")}`
}

// --- Skills shared between the list and the entries -------------------------------------------

export interface SkillUse {
  id: string
  label: string
  section: "esperienza" | "formazione" | "certificazione" | "progetto"
}

/** Where a skill is linked: removing it from the list removes it from these too. */
export function skillUses(p: Profile, name: string): SkillUse[] {
  const has = (skills: string[]) => skills.includes(name)
  return [
    ...p.experiences.filter((e) => has(e.skills)).map((e) => ({ id: e.id, label: `${e.role} · ${e.company}`, section: "esperienza" as const })),
    ...p.education.filter((e) => has(e.skills)).map((e) => ({ id: e.id, label: e.school, section: "formazione" as const })),
    ...p.certifications.filter((c) => has(c.skills)).map((c) => ({ id: c.id, label: c.name, section: "certificazione" as const })),
    ...p.projects.filter((x) => has(x.skills)).map((x) => ({ id: x.id, label: x.name, section: "progetto" as const })),
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
    p.skills.filter((s) => s.inferred).length
  )
}

/** Rough completeness, the way job sites nudge you to finish a profile. */
export function completeness(p: Profile): { score: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [!!p.photo, "una foto"],
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
      { skill: "Tedesco B2", kind: "gap", why: "nel profilo hai una conoscenza elementare" },
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
  update: (profile: Profile) => set({ stage: reviewCount(profile) ? "review" : "ready", profile }),
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
