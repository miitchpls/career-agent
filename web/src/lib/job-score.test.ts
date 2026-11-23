import { describe, expect, it } from "vitest"

import { EMPTY_GOALS, formatScore, goalSalary, goalsSet, hasTargets, shownScore } from "@/lib/job-score"
import { setLocale } from "@/lib/i18n"
import type { JobScore } from "@/lib/api"

const score = (status: JobScore["status"], id = 1): JobScore => ({
  id,
  url: "u",
  status,
  provider: "claude",
  model: null,
  value: status === "ready" ? 4.2 : null,
  decision: status === "ready" ? "apply" : null,
  result: null,
  error: null,
  created_at: "2026-11-23T10:00:00+00:00",
})

describe("job score", () => {
  it("writes one decimal in the UI's language", () => {
    setLocale("it")
    expect(formatScore(4)).toBe("4,0")
    expect(formatScore(4.25)).toMatch(/^4,[23]$/)
    setLocale("en")
    expect(formatScore(3.5)).toBe("3.5")
    setLocale("it")
  })

  it("shows the latest finished score, or the last one that did", () => {
    expect(shownScore({ score: score("ready"), earlier: null, targets_set: true })?.id).toBe(1)
    const earlier = score("ready", 1)
    expect(shownScore({ score: score("running", 2), earlier, targets_set: true })).toBe(earlier)
    expect(shownScore({ score: score("failed", 2), earlier: null, targets_set: true })).toBeNull()
  })

  it("knows when goals are set", () => {
    expect(goalsSet(EMPTY_GOALS)).toBe(false)
    expect(goalsSet({ ...EMPTY_GOALS, workModes: ["remote"] })).toBe(true)
    // Pay and dealbreakers alone don't give the goals dimension anything to compare.
    expect(hasTargets({ ...EMPTY_GOALS, minSalary: 1, dealbreakers: ["x"] })).toBe(false)
    expect(hasTargets({ ...EMPTY_GOALS, places: ["Zurigo"] })).toBe(true)
    expect(goalSalary({ ...EMPTY_GOALS, minSalary: 110000 })).toBe("110.000 CHF")
  })
})
