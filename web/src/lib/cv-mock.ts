/**
 * Mock tailored CV for one posting, UI only: CV generation isn't built yet.
 */
import { useSyncExternalStore } from "react"

import { msgs } from "@/lib/i18n"

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

/** Mock generation. The analysis is in the UI's language; the CV itself is in English. */
export function tailoredFor(title: string, company: string | null): Tailored {
  const t = msgs().cv.mock
  return {
    language: t.language,
    format: "A4",
    version: 1,
    generatedAt: t.now,
    matches: [
      { skill: "Python", kind: "have", why: t.why.python },
      { skill: "FastAPI", kind: "have", why: t.why.fastapi },
      { skill: "PostgreSQL", kind: "have", why: t.why.postgres },
      { skill: "Event-driven", kind: "have", why: t.why.events },
      { skill: "AWS", kind: "partial", why: t.why.aws },
      { skill: "Kafka", kind: "gap", why: t.why.kafka },
      { skill: t.germanB2, kind: "gap", why: t.why.german },
    ],
    changes: t.changes(title),
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
