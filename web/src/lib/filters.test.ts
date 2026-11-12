import { describe, expect, it } from "vitest"

import type { Query, Scope } from "@/lib/api"
import {
  DEFAULT_FILTERS,
  EMPTY_QUERY,
  fromQuery,
  parseScopes,
  sameQuery,
  serializeScopes,
  toQuery,
  type FilterState,
} from "@/lib/filters"

const base: Query = EMPTY_QUERY

describe("fromQuery / toQuery", () => {
  it("round-trips a saved query", () => {
    const q: Query = {
      ...base,
      scopes: [{ anywhere: false, places: [{ city: "Zurigo", country: "ch", region: "Zurigo", geo_id: 2657896 }], modes: ["hybrid"] }],
      title_any: ["python developer"],
      salary_min: 100,
      salary_currency: "CHF",
      salary_unknown: false,
    }
    const p = fromQuery(q)
    const state: FilterState = {
      ...DEFAULT_FILTERS,
      ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null)),
    } as FilterState
    expect(sameQuery(toQuery(state), q)).toBe(true)
  })

  it("compares queries regardless of key order", () => {
    const a: Query = { ...base, scopes: [{ anywhere: true, places: [], modes: ["remote"] }] }
    const b = { ...a, scopes: [{ modes: ["remote"], places: [], anywhere: true }] } as Query
    expect(sameQuery(a, b)).toBe(true)
    expect(sameQuery(a, { ...a, title_any: ["x"] })).toBe(false)
  })
})

describe("where= URL format", () => {
  const scopes: Scope[] = [
    {
      anywhere: false,
      places: [
        { city: "St. Gallen", country: "ch", region: "San Gallo", geo_id: 2658822 },
        { city: "L'Aia", country: "nl", region: null, geo_id: null },
      ],
      modes: ["onsite", "hybrid"],
    },
    { anywhere: true, places: [], modes: ["remote"] },
  ]

  it("round-trips places with separators in their names", () => {
    const s = serializeScopes(scopes)
    expect(s).toBe("St%2e%20Gallen:ch:2658822:San%20Gallo,L'Aia:nl~onsite.hybrid|*~remote")
    expect(parseScopes(s)).toEqual(scopes)
  })

  it("reads links from before geocoding", () => {
    expect(parseScopes("Zurigo:ch~onsite")).toEqual([
      { anywhere: false, places: [{ city: "Zurigo", country: "ch", region: null, geo_id: null }], modes: ["onsite"] },
    ])
  })

  it("rejects malformed values instead of throwing", () => {
    expect(parseScopes("%E0%A4%A:it")).toBeNull()
    expect(parseScopes("")).toBeNull()
    expect(parseScopes("*~bogus")).toEqual([{ anywhere: true, places: [], modes: [] }])
  })
})
