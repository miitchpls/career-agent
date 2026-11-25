import { afterEach, describe, expect, it } from "vitest"

import { getLocale, LOCALES, msgs, setLocale } from "@/lib/i18n"
import { suggest } from "@/lib/compose"
import { DEFAULT_FILTERS } from "@/lib/filters"
import { formatAmount, parseKoreanAmount, parseSalary } from "@/lib/currencies"
import { offersPhrase } from "@/lib/run-messages"
import { salaryLabel } from "@/lib/format"
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
    for (const { value } of LOCALES) {
      setLocale(value)
      expect(paths(msgs()).sort(), value).toEqual(ref)
    }
  })

  it("count in Russian plural forms", () => {
    setLocale("ru")
    expect(offersPhrase(1, 1)).toBe("1 вакансия, все новые")
    expect(offersPhrase(3, 0)).toBe("3 вакансии, уже просмотрены")
    expect(offersPhrase(11, 2)).toBe("11 вакансий, новых: 2")
    expect(offersPhrase(21, 0)).toBe("21 вакансия, уже просмотрены")
  })

  it("switch the messages used by plain functions", () => {
    setLocale("en")
    expect(getLocale()).toBe("en")
    expect(offersPhrase(6, 5)).toBe("6 jobs, 5 new")
    setLocale("de")
    expect(msgs().common.cancel).toBe("Abbrechen")
    expect(offersPhrase(1, 1)).toBe("1 neue Stelle")
    setLocale("ko")
    expect(getLocale()).toBe("ko")
    expect(msgs().common.cancel).toBe("취소")
  })

  it("label suggestions in the current language", () => {
    setLocale("en")
    expect(suggest("90k eur", DEFAULT_FILTERS, false)[0].label).toBe("Salary ≥ 90,000 EUR / year")
    setLocale("de")
    expect(suggest("90k eur", DEFAULT_FILTERS, false)[0].label).toBe("Gehalt ≥ 90.000 EUR / Jahr")
    setLocale("ko")
    expect(suggest("연봉 1억 2천만", DEFAULT_FILTERS, false)[0].label).toBe("연봉 ≥ 1억 2,000만 KRW / 년")
    expect(suggest("90k eur", DEFAULT_FILTERS, false)[0].label).toBe("연봉 ≥ 90,000 EUR / 년")
  })

  it("show won in 만 and 억 to Korean readers only", () => {
    setLocale("ko")
    expect(formatAmount(60_000_000, "KRW")).toBe("6,000만")
    expect(formatAmount(120_000_000, "KRW")).toBe("1억 2,000만")
    expect(formatAmount(100_000_000, "KRW")).toBe("1억")
    expect(formatAmount(90_000, "EUR")).toBe("90,000")
    expect(salaryLabel({ min_amount: 45_000_000, max_amount: 60_000_000, currency: "KRW" })).toBe("KRW 4500만–6000만")
    setLocale("it")
    expect(formatAmount(60_000_000, "KRW")).toBe("60.000.000")
    expect(salaryLabel({ min_amount: 45_000_000, max_amount: 60_000_000, currency: "KRW" })).toBe("KRW 45\u00a0Mln–60\u00a0Mln")
    expect(salaryLabel({ min_amount: 80_000, max_amount: 95_000, currency: "CHF" })).toBe("CHF 80K–95K")
  })

  it("parse what people type in any language", () => {
    expect(suggest("teilzeit", DEFAULT_FILTERS, false)[0].patch).toEqual({ jt: ["parttime"] })
    expect(suggest("last week", DEFAULT_FILTERS, false)[0].patch).toEqual({ posted: 168 })
    expect(parseSalary("100,000")).toBe(100_000)
    expect(parseKoreanAmount("6,000만 원")).toBe(60_000_000)
    expect(parseKoreanAmount("1억")).toBe(100_000_000)
    expect(parseKoreanAmount("6000")).toBeNull()
    expect(parseSalary("6000", "KRW")).toBe(60_000_000)
    expect(parseSalary("6000", "CHF")).toBe(6_000)
    expect(suggest("재택", DEFAULT_FILTERS, false)[0].id).toBe("mode:remote")
    expect(suggest("정규직", DEFAULT_FILTERS, false)[0].patch).toEqual({ jt: ["fulltime"] })
    expect(suggest("최근 1주", DEFAULT_FILTERS, false)[0].patch).toEqual({ posted: 168 })
    expect(suggest("연봉 90000", DEFAULT_FILTERS, false)[0].id).toMatch(/^salary/)
  })
})
