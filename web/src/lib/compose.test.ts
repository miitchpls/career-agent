import { describe, expect, it } from "vitest"

import type { PlaceOption } from "@/lib/api"
import { commitDraft, removeLast, suggest, type Suggestion } from "@/lib/compose"
import { DEFAULT_FILTERS, type FilterState } from "@/lib/filters"

const empty: FilterState = DEFAULT_FILTERS
const NAPLES: PlaceOption[] = [
  { geo_id: 3172394, city: "Napoli", region: "Campania", country: "it", country_name: "Italia" },
  { geo_id: 4165565, city: "Naples", region: "Florida", country: "us", country_name: "Stati Uniti" },
]
const apply = (f: FilterState, s: Suggestion) => ({ ...f, ...s.patch }) as FilterState
const labels = (s: Suggestion[]) => s.map((x) => x.label)

describe("suggest", () => {
  it("puts title and text first, then geocoded cities with region and country", () => {
    expect(labels(suggest("Naples", empty, false, NAPLES))).toEqual([
      "Titolo contiene «Naples»",
      "Testo contiene «Naples»",
      "Napoli, Campania, Italia",
      "Naples, Florida, Stati Uniti",
    ])
  })

  it("inherits the country from the picked city", () => {
    const f = apply(empty, suggest("Naples", empty, false, NAPLES)[3])
    expect(f.where).toEqual([
      { anywhere: false, places: [{ city: "Naples", country: "us", region: "Florida", geo_id: 4165565 }], modes: [] },
    ])
  })

  it("builds (city · mode) OR (anywhere · remote) through the 'oppure' flow", () => {
    let f = apply(empty, suggest("python developer", empty, false)[0])
    f = apply(f, suggest("Napoli", f, false, NAPLES)[2])
    f = apply(f, suggest("ibr", f, false)[0])
    expect(suggest("o", f, false)[0]).toMatchObject({ id: "or", patch: null, keepGroup: true })
    f = apply(f, suggest("remoto", f, true)[0]) // after "oppure": goes into a new group
    // Modes added from suggestions keep postings with no stated mode, like the editors' default.
    expect(f.where.map((s) => [s.anywhere, s.modes])).toEqual([
      [false, ["hybrid", "unknown"]],
      [true, ["remote", "unknown"]],
    ])
    expect(f.title).toEqual(["python developer"])
  })

  it("parses salaries, exclusions and dates", () => {
    expect(suggest("100k", empty, false)[0].patch).toEqual({ salary: 100, cur: null })
    expect(suggest("120000", empty, false)[0].patch).toEqual({ salary: 120, cur: null })
    expect(suggest("90k eur", empty, false)[0]).toMatchObject({ label: "Stipendio ≥ 90.000 EUR / anno", patch: { salary: 90, cur: "EUR" } })
    expect(suggest("100.000", empty, false)[0]).toMatchObject({ label: "Stipendio ≥ 100.000 CHF / anno", patch: { salary: 100, cur: null } })
    expect(suggest("120'000 chf", empty, false)[0].patch).toEqual({ salary: 120, cur: null })
    expect(suggest("£ 70k", empty, false)[0].patch).toEqual({ salary: 70, cur: "GBP" })
    expect(suggest("80k pippo", empty, false).some((s) => s.id.startsWith("salary:"))).toBe(false)
    expect(suggest("ultimi 7", empty, false)[0].patch).toEqual({ posted: 168 })
  })

  it("reads won as Koreans write it", () => {
    const won = (t: string, f = empty) => suggest(t, f, false).find((s) => s.id.startsWith("salary:"))?.patch
    expect(won("연봉 6000만")).toEqual({ salary: 60_000, cur: "KRW" })
    expect(won("6천만원")).toEqual({ salary: 60_000, cur: "KRW" })
    expect(won("1억 2천만")).toEqual({ salary: 120_000, cur: "KRW" })
    expect(won("1.5억")).toEqual({ salary: 150_000, cur: "KRW" })
    expect(won("₩60,000,000")).toEqual({ salary: 60_000, cur: "KRW" })
    expect(won("60,000,000원")).toEqual({ salary: 60_000, cur: "KRW" })
    expect(won("60000000 krw")).toEqual({ salary: 60_000, cur: "KRW" })
    // With won already chosen, a bare number is in 만, as on Korean job sites.
    expect(won("6000", { ...empty, cur: "KRW" })).toEqual({ salary: 60_000, cur: "KRW" })
    // The plausible range follows the currency: 60 million is a salary in won, not in francs.
    expect(won("60000000")).toBeUndefined()
    expect(won("50만")).toBeUndefined() // 500,000 won a year: not a salary
  })

  it("doesn't add the same city twice to a group", () => {
    const f = apply(empty, suggest("Napoli", empty, false, NAPLES)[2])
    expect(apply(f, suggest("Napoli", f, false, NAPLES)[2]).where[0].places).toHaveLength(1)
  })
})

describe("removeLast", () => {
  it("removes the right-most piece of the sentence", () => {
    const f: FilterState = { ...empty, title: ["go", "rust"], salary: 90 }
    expect(removeLast(f)).toEqual({ salary: null, nosalary: null, cur: null })
    expect(removeLast({ ...f, salary: null })).toEqual({ title: ["go"] })
    expect(removeLast(empty)).toBeNull()
  })
})

describe("draft chips", () => {
  it("offers 'Titolo contiene' and 'Testo contiene' first on an empty input", () => {
    const [first, second] = suggest("", empty, false)
    expect([first.draft, second.draft]).toEqual(["title", "q"])
    expect(labels([first, second])).toEqual(["Titolo contiene…", "Testo contiene…"])
  })

  it("names the typed variants the same way", () => {
    expect(labels(suggest("ragioniere", empty, false))).toContain("Testo contiene «ragioniere»")
  })

  it("commits typed text into the right filter", () => {
    expect(commitDraft({ ...empty, title: ["go"] }, "title", " Contabile ")).toEqual({ title: ["go", "contabile"] })
    expect(commitDraft(empty, "q", "part-time")).toEqual({ q: "part-time" })
    expect(commitDraft(empty, "title", "   ")).toBeNull()
  })
})

describe("panels", () => {
  it("opens the salary and date editors instead of typing a keyword", () => {
    const idle = suggest("", empty, false)
    expect(idle.find((x) => x.id === "salary-panel")?.panel).toBe("salary")
    expect(idle.find((x) => x.id === "posted-panel")?.panel).toBe("posted")
    expect(suggest("stip", empty, false)[0]).toMatchObject({ panel: "salary", patch: null })
  })
})

describe("job type", () => {
  it("adds a type from what users naturally type", () => {
    expect(suggest("stage", empty, false)[0]).toMatchObject({ label: "Tipo di impiego: Tirocinio", patch: { jt: ["internship"] } })
    expect(suggest("part", empty, false)[0].patch).toEqual({ jt: ["parttime"] })
    expect(suggest("tempo pieno", empty, false)[0].patch).toEqual({ jt: ["fulltime"] })
  })

  it("is offered in the idle menu and removed by backspace", () => {
    expect(suggest("", empty, false).find((x) => x.id === "jobtype-panel")?.panel).toBe("jobtype")
    expect(removeLast({ ...empty, title: ["go"], jt: ["fulltime", "parttime"] })).toEqual({ jt: ["fulltime"] })
    expect(removeLast({ ...empty, title: ["go"], jt: ["fulltime"] })).toEqual({ jt: null, jtnull: null })
  })
})

describe("salary amounts", () => {
  it("reads full amounts, separators, k, and bare thousands", async () => {
    const { parseSalary } = await import("@/lib/currencies")
    expect(parseSalary("100.000")).toBe(100_000)
    expect(parseSalary("100'000")).toBe(100_000)
    expect(parseSalary("100000")).toBe(100_000)
    expect(parseSalary("100k")).toBe(100_000)
    expect(parseSalary("100")).toBe(100_000) // nobody earns 100 a year: thousands
    expect(parseSalary("abc")).toBeNull()
  })
})
