import { describe, expect, it } from "vitest"

import { mentions, tailoredFor } from "@/lib/cv-mock"
import { EMPTY_PROFILE, type Experience, type Profile } from "@/lib/profile"

const exp = (id: string, role: string, skills: string[], bullets: string[]): Experience => ({
  id,
  role,
  employment: null,
  company: `${id} Co`,
  location: "",
  locationType: null,
  start: { month: 0, year: 2020 },
  end: null,
  current: false,
  bullets,
  skills,
  media: [],
})

const profile: Profile = {
  ...EMPTY_PROFILE,
  name: "Giulia",
  summary: "Data engineer.",
  experiences: [
    exp("a", "Frontend Developer", ["React"], ["Built the design system."]),
    exp("b", "Data Engineer", ["Spark", "Kafka"], ["Wrote reports.", "Streaming pipeline with Kafka."]),
  ],
  skills: [{ name: "React" }, { name: "Spark" }, { name: "Kafka" }, { name: "AWS", inferred: true }],
}

describe("mentions", () => {
  it("matches whole words only", () => {
    expect(mentions("We use Go and Python", "Go")).toBe(true)
    expect(mentions("A good team", "Go")).toBe(false)
    expect(mentions("C++ and C# experience", "C++")).toBe(true)
    expect(mentions("Node.js services", "Node.js")).toBe(true)
  })
})

describe("tailoredFor", () => {
  const job = { title: "Data Engineer", description: "Kafka and Spark on AWS. Terraform is a plus." }

  it("finds what the posting asks in the profile, and what is missing", () => {
    const cv = tailoredFor(profile, job)
    const kinds = Object.fromEntries(cv.matches.map((m) => [m.skill, m.kind]))
    expect(kinds).toEqual({ Spark: "have", Kafka: "have", AWS: "partial", Terraform: "gap" })
  })

  it("moves matching bullets and skills first, keeps experiences in order, and says so", () => {
    const cv = tailoredFor(profile, job)
    expect(cv.profile.experiences.map((e) => e.id)).toEqual(["a", "b"]) // chronology untouched
    expect(cv.profile.experiences[1].bullets[0]).toBe("Streaming pipeline with Kafka.")
    expect(cv.marked).toEqual(["Streaming pipeline with Kafka."])
    expect(cv.profile.skills.map((s) => s.name)).toEqual(["Spark", "Kafka", "AWS", "React"])
    expect(cv.changes).toHaveLength(3) // bullets, skills, summary kept
    expect(profile.experiences[0].id).toBe("a") // the profile itself is untouched
  })

  it("reports when nothing needs to move", () => {
    const cv = tailoredFor({ ...profile, summary: "" }, { title: "Chef", description: "Cooking." })
    expect(cv.changes).toEqual(["Nessuno spostamento: il profilo è già in ordine per questo annuncio"])
    expect(cv.marked).toEqual([])
  })
})
