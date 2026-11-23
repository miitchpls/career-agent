import { describe, expect, it } from "vitest"

import type { ReviewSuggestion } from "@/lib/api"
import { applySuggestion, blanks, currentText, diffWords, fill, isStale, parts } from "@/lib/profile-review"
import { EMPTY_PROFILE, endsBefore, type Experience, type Profile } from "@/lib/profile"

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

describe("date order", () => {
  it("is checked by month when both have one, by year otherwise", () => {
    expect(endsBefore({ month: 5, year: 2022 }, { month: 1, year: 2022 })).toBe(true)
    expect(endsBefore({ month: 5, year: 2022 }, { month: 5, year: 2022 })).toBe(false)
    expect(endsBefore({ month: 2, year: 2021 }, { month: null, year: 2021 })).toBe(false)
    expect(endsBefore({ month: null, year: 2021 }, { month: 0, year: 2020 })).toBe(true)
    expect(endsBefore(null, { month: 0, year: 2020 })).toBe(false)
    expect(endsBefore({ month: 0, year: 2020 }, null)).toBe(false)
  })
})
