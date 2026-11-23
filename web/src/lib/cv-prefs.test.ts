import { describe, expect, it } from "vitest"

import { DEFAULT_CV_PREFS, jobCountry, postingLanguage, resolveCv } from "@/lib/cv-prefs"

describe("cv preferences", () => {
  it("reads the country at the end of a board location", () => {
    expect(jobCountry("Zurich, Zurich, Switzerland")).toBe("ch")
    expect(jobCountry("Zürich, ZH, CH")).toBe("ch")
    expect(jobCountry("New York, NY, United States")).toBe("us")
    expect(jobCountry("Toronto, ON, Canada")).toBe("ca")
    expect(jobCountry("Remote")).toBeNull()
    expect(jobCountry(null)).toBeNull()
  })

  it("guesses the posting's language from its common words", () => {
    expect(postingLanguage("Wir suchen eine Person mit Erfahrung und Freude an der Arbeit für das Team")).toBe("de")
    expect(postingLanguage("Cerchiamo una persona con esperienza per il team della piattaforma")).toBe("it")
    expect(postingLanguage("You will join the team and work with our engineers")).toBe("en")
    expect(postingLanguage(null)).toBe("en")
  })

  it("resolves auto: Letter and no photo in the US, A4 and photo in Switzerland", () => {
    const us = { location: "Austin, TX, United States", description: "You will build the platform with our team" }
    const ch = { location: "Zurich, Switzerland", description: "Wir suchen dich für unser Team und die Plattform" }
    expect(resolveCv(DEFAULT_CV_PREFS, us, true)).toEqual({ language: "en", format: "letter", style: "standard", photo: false })
    expect(resolveCv(DEFAULT_CV_PREFS, ch, true)).toEqual({ language: "de", format: "a4", style: "standard", photo: true })
    expect(resolveCv(DEFAULT_CV_PREFS, ch, false).photo).toBe(false) // nothing to show
  })

  it("explicit choices win over the posting", () => {
    const us = { location: "Austin, TX, United States", description: "You will build the platform" }
    const prefs = { language: "it", format: "a4", style: "executive", photo: "always" } as const
    expect(resolveCv(prefs, us, true)).toEqual({ language: "it", format: "a4", style: "executive", photo: true })
    expect(resolveCv({ ...prefs, photo: "never" }, us, true).photo).toBe(false)
  })
})
