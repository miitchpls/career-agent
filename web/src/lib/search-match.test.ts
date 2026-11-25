import { describe as group, expect, it } from "vitest"

import { setLocale } from "@/lib/i18n"
import { describe } from "@/lib/search-match"

group("search match", () => {
  it("says the unmet conditions in words, with what was searched", () => {
    setLocale("it")
    expect(describe({ kind: "place", state: "unknown" })?.text).toBe("Luogo non verificabile")
    expect(describe({ kind: "mode", state: "no", value: "onsite", expected: ["hybrid", "remote"] })?.text).toBe(
      "In sede, cerchi Ibrido o Remoto",
    )
    expect(describe({ kind: "salary", state: "unknown", value: null, expected: 90000, currency: "CHF" })?.text).toBe(
      "Stipendio non indicato, cerchi da CHF 90K",
    )
    expect(describe({ kind: "salary", state: "no", value: 85000, expected: 90000, currency: "CHF" })?.text).toBe(
      "CHF 85K, cerchi da CHF 90K",
    )
  })

  it("leaves out what the search was met by: the posting was found by it", () => {
    expect(describe({ kind: "place", state: "ok", value: "Lugano" })).toBeNull()
    expect(describe({ kind: "job_type", state: "ok", value: ["fulltime"], expected: ["fulltime"] })).toBeNull()
    expect(describe({ kind: "posted", state: "ok", value: "2026-11-23", expected: 24 })).toBeNull()
    expect(describe({ kind: "posted", state: "unknown", value: null, expected: 24 })?.text).toBe("Data non indicata")
  })
})
