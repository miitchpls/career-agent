import { describe, expect, it } from "vitest"

import { countryCodes, countryName, countryOf } from "@/lib/countries"

describe("countries", () => {
  it("knows every country from the browser's data", () => {
    const codes = countryCodes()
    expect(codes.length).toBeGreaterThan(240)
    expect(codes).toContain("it")
    expect(codes).not.toContain("eu")
    expect(countryName("ch", "it")).toBe("Svizzera")
    expect(countryName("ch", "en")).toBe("Switzerland")
  })

  it("reads the country at the end of a location, in the boards' languages", () => {
    expect(countryOf("Zurich, Zurich, Switzerland")).toBe("ch")
    expect(countryOf("Milano, Lombardia, Italia")).toBe("it")
    expect(countryOf("Paris, Île-de-France, France")).toBe("fr")
    expect(countryOf("São Paulo, Brasil")).toBe("br")
    expect(countryOf("Austin, TX, United States")).toBe("us")
    expect(countryOf("Austin, TX, USA")).toBe("us")
    expect(countryOf("Zürich, ZH, CH")).toBe("ch")
    expect(countryOf("서울특별시, 대한민국")).toBe("kr")
    expect(countryOf("東京都, 日本")).toBe("jp")
    expect(countryOf("Seoul, 한국")).toBe("kr")
    expect(countryOf("Boston, MA")).toBe("us")
    expect(countryOf("Wilmington, DE")).toBe("us")
    expect(countryOf("Toronto, ON")).toBe("ca")
    expect(countryOf("Berlin, BE, DE")).toBe("de")
    expect(countryOf("Amsterdam, NL")).toBe("nl")
    expect(countryOf("Remote")).toBeNull()
    expect(countryOf("Remote, Remote")).toBeNull()
    expect(countryOf(null)).toBeNull()
  })
})
