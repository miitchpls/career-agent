import { afterEach, describe, expect, it } from "vitest"

import { getLocale, msgs, setLocale } from "@/lib/i18n"
import { suggest } from "@/lib/compose"
import { DEFAULT_FILTERS } from "@/lib/filters"
import { parseSalary } from "@/lib/currencies"
import { offersPhrase } from "@/lib/run-messages"
import { de } from "@/locales/de"
import { en } from "@/locales/en"
import { it as itMsgs } from "@/locales/it"

/** Every key path, functions and arrays included as leaves. */
function paths(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? paths(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

afterEach(() => setLocale("it"))

describe("locales", () => {
  it("have the same keys as Italian", () => {
    const ref = paths(itMsgs).sort()
    expect(paths(en).sort()).toEqual(ref)
    expect(paths(de).sort()).toEqual(ref)
  })

  it("switch the messages used by plain functions", () => {
    setLocale("en")
    expect(getLocale()).toBe("en")
    expect(offersPhrase(6, 5)).toBe("6 jobs, 5 new")
    setLocale("de")
    expect(msgs().common.cancel).toBe("Abbrechen")
    expect(offersPhrase(1, 1)).toBe("1 neue Stelle")
  })

  it("label suggestions in the current language", () => {
    setLocale("en")
    expect(suggest("90k eur", DEFAULT_FILTERS, false)[0].label).toBe("Salary ≥ 90,000 EUR / year")
    setLocale("de")
    expect(suggest("90k eur", DEFAULT_FILTERS, false)[0].label).toBe("Gehalt ≥ 90.000 EUR / Jahr")
  })

  it("parse what people type in any language", () => {
    expect(suggest("teilzeit", DEFAULT_FILTERS, false)[0].patch).toEqual({ jt: ["parttime"] })
    expect(suggest("last week", DEFAULT_FILTERS, false)[0].patch).toEqual({ posted: 168 })
    expect(parseSalary("100,000")).toBe(100_000)
  })
})
