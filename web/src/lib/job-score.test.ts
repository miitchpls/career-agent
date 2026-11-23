import { describe, expect, it } from "vitest"

import { formatScore, shownScore } from "@/lib/job-score"
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
    expect(shownScore({ score: score("ready"), earlier: null })?.id).toBe(1)
    const earlier = score("ready", 1)
    expect(shownScore({ score: score("running", 2), earlier })).toBe(earlier)
    expect(shownScore({ score: score("failed", 2), earlier: null })).toBeNull()
  })
})
