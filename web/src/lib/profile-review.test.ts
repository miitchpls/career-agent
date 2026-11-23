import { describe, expect, it } from "vitest"

import type { ReviewSuggestion } from "@/lib/api"
import { profileChecks } from "@/lib/profile-checks"
import { applySuggestion, blanks, currentText, diffWords, fill, isStale, parts } from "@/lib/profile-review"
import { EMPTY_PROFILE, type Experience, type Profile } from "@/lib/profile"

const exp = (over: Partial<Experience> = {}): Experience => ({
  id: "e1",
  role: "Data Engineer",
  employment: null,
  company: "Lumen",
  location: "",
  locationType: null,
  start: { month: 0, year: 2020 },
  end: null,
  current: true,
  bullets: ["Responsabile della migrazione su Databricks.", "Ridotto i costi del 30% con Airflow."],
  skills: ["Spark"],
  media: [],
  ...over,
})

const profile: Profile = {
  ...EMPTY_PROFILE,
  headline: "Data Engineer",
  summary: "Ingegnera dei dati.",
  experiences: [exp()],
  projects: [{ id: "p1", name: "dbt-lint", description: "Un linter.", start: null, end: null, current: false, url: "", associatedWith: null, skills: [], media: [] }],
}

const sug = (over: Partial<ReviewSuggestion>): ReviewSuggestion => ({
  id: "s1",
  kind: "rewrite",
  section: "experience",
  entryId: "e1",
  field: "bullet",
  index: 0,
  before: "Responsabile della migrazione su Databricks.",
  after: "Ho migrato il data lake su Databricks.",
  reason: "",
  state: "open",
  ...over,
})

describe("review suggestions", () => {
  it("fill a question's blanks in order", () => {
    const text = "Ridotto i tempi del [[percentuale]] in [[mesi]]."
    expect(blanks(text)).toEqual(["percentuale", "mesi"])
    expect(fill(text, ["40%", " 3 mesi "])).toBe("Ridotto i tempi del 40% in 3 mesi.")
    expect(parts(text)).toEqual([
      { text: "Ridotto i tempi del " },
      { blank: "percentuale", index: 0 },
      { text: " in " },
      { blank: "mesi", index: 1 },
      { text: "." },
    ])
  })

  it("apply to a bullet, a description, the summary and the skills", () => {
    expect(applySuggestion(profile, sug({})).experiences[0].bullets).toEqual([
      "Ho migrato il data lake su Databricks.",
      "Ridotto i costi del 30% con Airflow.",
    ])
    const desc = sug({ section: "project", entryId: "p1", field: "description", index: null, before: "Un linter.", after: "Un linter per dbt." })
    expect(applySuggestion(profile, desc).projects[0].description).toBe("Un linter per dbt.")
    const summary = sug({ section: "profile", entryId: null, field: "summary", index: null, before: profile.summary, after: "Nuovo." })
    expect(applySuggestion(profile, summary).summary).toBe("Nuovo.")
    const skill = sug({ kind: "add_skill", field: "skill", index: null, before: "", after: "Airflow" })
    const next = applySuggestion(profile, skill)
    expect(next.experiences[0].skills).toEqual(["Spark", "Airflow"])
    expect(next.skills.map((x) => x.name)).toContain("Airflow")
    expect(isStale(next, skill)).toBe(true) // added: nothing left to do
  })

  it("go stale when the text moved on", () => {
    expect(isStale(profile, sug({}))).toBe(false)
    const edited = { ...profile, experiences: [exp({ bullets: ["Altro testo."] })] }
    expect(isStale(edited, sug({}))).toBe(true)
    expect(currentText(profile, sug({ index: 9 }))).toBeNull()
    expect(isStale(profile, sug({ entryId: "gone" }))).toBe(true)
  })

  it("diff by words", () => {
    expect(diffWords("Ho fatto la migrazione", "Ho guidato la migrazione")).toEqual([
      { text: "Ho ", change: "same" },
      { text: "fatto", change: "removed" },
      { text: "guidato", change: "added" },
      { text: " la migrazione", change: "same" },
    ])
  })
})

describe("profile checks", () => {
  const ids = (p: Profile) => profileChecks(p).map((c) => c.id)

  it("flag what needs no AI to spot", () => {
    const p: Profile = {
      ...profile,
      headline: "",
      experiences: [
        exp({ id: "a", current: false, start: { month: 5, year: 2022 }, end: { month: 1, year: 2021 } }),
        exp({ id: "b", bullets: [] }),
        exp({ id: "c", bullets: ["Nessun numero qui.", "x".repeat(300), "Responsabile della migrazione su Databricks."] }),
      ],
      projects: [{ ...profile.projects[0], description: "" }],
    }
    expect(ids(p)).toEqual(["headline", "a:endBeforeStart", "b:bullets", "c:numbers", "c:long:1", "c:dup:2", "p1:description"])
    expect(profileChecks(p)[0].target).toBe("profile-identity")
    expect(profileChecks(p)[1].target).toBe("entry-a")
  })

  it("stay quiet on a tidy profile", () => {
    expect(ids(profile)).toEqual([])
  })
})
