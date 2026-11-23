import { getLocale, intlTag } from "@/lib/i18n"

/** Currencies the salary filter can use (all have ECB reference rates). Most common first. */
export const CURRENCIES = [
  "EUR", "CHF", "GBP", "USD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON",
  "CAD", "AUD", "NZD", "JPY", "KRW", "SGD", "HKD", "INR", "BRL", "MXN", "ZAR", "TRY", "ILS",
] as const // prettier-ignore
export type Currency = (typeof CURRENCIES)[number]

/** Salary filter currency when none is chosen (keep in sync with Query.salary_currency). */
export const DEFAULT_CURRENCY: Currency = "CHF"

/**
 * Plausible yearly salaries, in thousands of the currency: 10k–10M, scaled up where one unit
 * is worth little (a Korean salary runs to tens of millions of won). Beyond them a number is
 * more likely a year or a typo than a salary. Keep the top in sync with Query.salary_min.
 */
const SCALE: Partial<Record<Currency, number>> = { INR: 10, JPY: 100, HUF: 100, KRW: 1000 }
export function salaryRangeK(cur: Currency): [number, number] {
  const s = SCALE[cur] ?? 1
  return [10 * s, 10_000 * s]
}

/**
 * Korean amounts in 만 (10,000) and 억 (100,000,000), as salaries are said in Korea:
 * "6000만", "6,000만 원", "6천만", "1억", "1.2억", "1억 2천만원". Null without 만 or 억.
 */
export function parseKoreanAmount(raw: string): number | null {
  const t = raw.replace(/[\s,]/g, "").replace(/원$/, "")
  const m = /^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)(천)?만)?$/.exec(t)
  if (!m || (!m[1] && !m[2])) return null
  const n = Number(m[1] ?? 0) * 1e8 + Number(m[2] ?? 0) * (m[3] ? 1000 : 1) * 1e4
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/**
 * Typed salary → full yearly amount: "100.000", "100'000", "100k", "100" (= 100.000). In won,
 * Korean units ("6000만") and bare numbers in 만, as Korean job sites take them ("6000" =
 * 60,000,000).
 */
export function parseSalary(raw: string, cur?: Currency): number | null {
  const korean = parseKoreanAmount(raw)
  if (korean !== null) return korean
  const m = /^\s*(\d{1,3}(?:[.,'’ \u00a0\u202f]\d{3})+|\d+)\s*(k|mila|tsd)?\s*$/i.exec(raw)
  if (!m) return null
  let n = Number(m[1].replace(/[.,'’ \u00a0\u202f]/g, ""))
  if (m[2]) n *= 1000
  else if (cur === "KRW" && n < 100_000) n *= 10_000
  else if (n < 1000) n *= 1000 // nobody's yearly salary is under a thousand: they meant thousands
  return Number.isFinite(n) ? n : null
}

/** 60,000,000 → "6,000만", 120,000,000 → "1억 2,000만": won as Koreans read them. */
function manwon(n: number): string {
  const r = Math.round(n / 1e4) * 1e4
  const eok = Math.floor(r / 1e8)
  const man = (r % 1e8) / 1e4
  const f = (x: number) => x.toLocaleString("ko-KR")
  return [eok && `${f(eok)}억`, man && `${f(man)}만`].filter(Boolean).join(" ") || f(n)
}

/** 100000 → "100.000" (or "100,000" in English); won in a Korean UI → "6,000만". */
export const formatAmount = (n: number, cur?: Currency) =>
  cur === "KRW" && getLocale() === "ko" && n >= 1e4 ? manwon(n) : n.toLocaleString(intlTag(), { maximumFractionDigits: 0 })

const SYMBOLS: Record<string, Currency> = {
  "€": "EUR", $: "USD", "£": "GBP", fr: "CHF", franchi: "CHF", franken: "CHF", euro: "EUR",
  dollari: "USD", dollars: "USD", dollar: "USD", sterline: "GBP", pounds: "GBP", pfund: "GBP",
  "₩": "KRW", "원": "KRW", won: "KRW",
} // prettier-ignore

/** "chf", "€", "dollari" → ISO code, or null. */
export function parseCurrency(token: string | undefined): Currency | null {
  if (!token) return null
  const t = token.trim().toLowerCase()
  if (SYMBOLS[t]) return SYMBOLS[t]
  const code = t.toUpperCase()
  return (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null
}
