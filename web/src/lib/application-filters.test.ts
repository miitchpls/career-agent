import { describe, expect, it } from "vitest"

import { applyFilters, inPeriod, matches, NO_FILTERS, scoreBand, sentAt } from "@/lib/application-filters"
import type { Application, AppStatus } from "@/lib/applications-mock"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 24)
const app = (id: string, o: Partial<Omit<Application, "events">> & { events?: [AppStatus, number][] } = {}): Application => ({
  id,
  title: "Backend Engineer",
  company: "Acme",
  location: "Zürich",
  site: "linkedin",
  url: "",
  score: null,
  cv: null,
  ...o,
  events: (o.events ?? [["applied", 1]]).map(([status, d]) => ({ status, at: new Date(NOW - d * DAY).toISOString() })),
})

describe("application filters", () => {
  it("dates a period from when the application was sent", () => {
    const a = app("a", { events: [["saved", 40], ["applied", 20], ["interview", 2]] })
    expect(sentAt(a)).toBe(new Date(NOW - 20 * DAY).toISOString())
    expect(inPeriod(a, 30, NOW)).toBe(true)
    expect(inPeriod(a, 7, NOW)).toBe(false) // recent activity, but sent three weeks ago
    expect(inPeriod(app("b", { events: [["saved", 3]] }), 7, NOW)).toBe(true) // not sent: when added
    expect(inPeriod(a, null, NOW)).toBe(true)
  })

  it("searches title, company and place, any order, accents aside", () => {
    const a = app("a")
    expect(matches(a, "acme backend")).toBe(true)
    expect(matches(a, "zurich")).toBe(true)
    expect(matches(a, "globex")).toBe(false)
    expect(matches(a, "  ")).toBe(true)
  })

  it("filters by source and score band, and sorts", () => {
    const list = [
      app("hi", { score: { value: 4.4, decision: "apply" }, events: [["applied", 9]] }),
      app("mid", { score: { value: 3.2, decision: "consider" }, site: "indeed", events: [["applied", 2]] }),
      app("none", { site: "other", events: [["applied", 5]] }),
    ]
    expect(scoreBand(list[0])).toBe("high")
    expect(applyFilters(list, { ...NO_FILTERS, sources: ["indeed", "other"] }).map((a) => a.id)).toEqual(["mid", "none"])
    expect(applyFilters(list, { ...NO_FILTERS, scores: ["none"] }).map((a) => a.id)).toEqual(["none"])
    expect(applyFilters(list, { ...NO_FILTERS, sort: "score" }).map((a) => a.id)).toEqual(["hi", "mid", "none"])
    expect(applyFilters(list, NO_FILTERS).map((a) => a.id)).toEqual(["mid", "none", "hi"])
  })
})
