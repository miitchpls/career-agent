/**
 * Mock tailored CV for one posting: no AI yet, but built from the real profile and posting.
 * It finds what the posting asks for in the profile, moves the bullets (within their
 * experience) and the skills the posting mentions to the top, and reports each move. Nothing is
 * rewritten or added: that is the AI generation's job.
 */
import { useSyncExternalStore } from "react"

import type { Job } from "@/lib/api"
import { msgs } from "@/lib/i18n"
import { skillUses, type Profile } from "@/lib/profile"

// --- Tailored CV for one posting -----------------------------------------------------------

export type MatchKind = "have" | "partial" | "gap"

export interface Tailored {
  version: number
  generatedAt: string
  matches: { skill: string; kind: MatchKind; why: string }[]
  changes: string[]
  /** The profile reordered for the posting: what the CV shows. */
  profile: Profile
  /** Texts moved for the posting, highlighted in the preview. */
  marked: string[]
}

// Skills postings commonly ask for, looked up when the profile doesn't name them.
const VOCABULARY = [
  "Python", "Java", "JavaScript", "TypeScript", "Go", "Rust", "C++", "C#", "Scala", "Kotlin", "Swift", "SQL",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "RabbitMQ", "Spark", "Airflow", "dbt",
  "Snowflake", "Databricks", "BigQuery", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Linux",
  "React", "Vue", "Angular", "Node.js", "Django", "FastAPI", "Flask", "Spring", "GraphQL", "CI/CD",
  "PyTorch", "TensorFlow", "Machine Learning", "LLM", "Figma", "Tableau", "Power BI", "Salesforce", "SAP",
] // prettier-ignore

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Whether `text` names `term` as a whole word ("Go" not in "good", "C++" as written). */
export function mentions(text: string, term: string): boolean {
  if (!term.trim()) return false
  return new RegExp(`(^|[^\\p{L}\\p{N}+#])${escapeRe(term.trim())}(?=$|[^\\p{L}\\p{N}+#])`, "iu").test(text)
}

export function tailoredFor(profile: Profile, job: Pick<Job, "title" | "description">): Tailored {
  const t = msgs().cv.mock
  const posting = `${job.title}\n${job.description ?? ""}`
  const asked = (text: string) => profile.skills.some((s) => mentions(posting, s.name) && mentions(text, s.name))

  // What the posting asks that the profile has, has only by inference, or lacks.
  const matches: Tailored["matches"] = []
  for (const s of profile.skills) {
    if (!mentions(posting, s.name)) continue
    const where = skillUses(profile, s.name).map((u) => u.label)
    matches.push(
      s.inferred
        ? { skill: s.name, kind: "partial", why: t.why.inferred }
        : { skill: s.name, kind: "have", why: where.length ? t.why.used(where.slice(0, 2).join(", ")) : t.why.listed },
    )
  }
  const known = new Set(profile.skills.map((s) => s.name.toLowerCase()))
  for (const term of VOCABULARY)
    if (!known.has(term.toLowerCase()) && mentions(posting, term)) matches.push({ skill: term, kind: "gap", why: t.why.missing })

  // Experiences keep their order: a CV out of chronological order reads as hiding something.
  const changes: string[] = []

  // Bullets: those naming an asked skill move up within their experience.
  const marked: string[] = []
  const experiences = profile.experiences.map((e) => {
    const first = e.bullets.filter((b) => asked(b))
    const moved = first.filter((b, i) => e.bullets.indexOf(b) !== i)
    marked.push(...moved)
    return { ...e, bullets: [...first, ...e.bullets.filter((b) => !asked(b))] }
  })
  if (marked.length) changes.push(t.moved(marked.length))

  const firstSkills = profile.skills.filter((s) => mentions(posting, s.name))
  const skills = [...firstSkills, ...profile.skills.filter((s) => !mentions(posting, s.name))]
  if (firstSkills.length && skills.some((s, i) => s !== profile.skills[i])) changes.push(t.skillsFirst(firstSkills.length))

  if (!changes.length) changes.push(t.nothing)
  if (profile.summary) changes.push(t.summaryKept)

  return {
    version: 1,
    generatedAt: t.now,
    matches: [...matches.filter((m) => m.kind !== "gap"), ...matches.filter((m) => m.kind === "gap")].slice(0, 12),
    changes,
    profile: { ...profile, experiences, skills },
    marked,
  }
}

// --- Which postings have a (mock) CV -----------------------------------------------------------

let generated: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

export const cvStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => generated,
  markGenerated(url: string) {
    generated = new Set([...generated, url])
    listeners.forEach((l) => l())
  },
}

/** job urls with a generated CV */
export function useGenerated(): ReadonlySet<string> {
  return useSyncExternalStore(cvStore.subscribe, cvStore.get)
}
