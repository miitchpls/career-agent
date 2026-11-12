/** Currencies the salary filter can use (all have ECB reference rates). Most common first. */
export const CURRENCIES = [
  "EUR", "CHF", "GBP", "USD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON",
  "CAD", "AUD", "NZD", "JPY", "SGD", "HKD", "INR", "BRL", "MXN", "ZAR", "TRY", "ILS",
] as const // prettier-ignore
export type Currency = (typeof CURRENCIES)[number]

/** Salary filter currency when none is chosen (keep in sync with Query.salary_currency). */
export const DEFAULT_CURRENCY: Currency = "CHF"

/** Typed salary → full yearly amount: "100.000", "100'000", "100k", "100" (= 100.000). */
export function parseSalary(raw: string): number | null {
  const m = /^\s*(\d{1,3}(?:[.'’ ]\d{3})+|\d+)\s*(k|mila)?\s*$/i.exec(raw)
  if (!m) return null
  let n = Number(m[1].replace(/[.'’ ]/g, ""))
  if (m[2] || n < 1000) n *= 1000 // nobody's yearly salary is under a thousand: they meant thousands
  return Number.isFinite(n) ? n : null
}

/** 100000 → "100.000" */
export const formatAmount = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 0 })

const SYMBOLS: Record<string, Currency> = { "€": "EUR", $: "USD", "£": "GBP", fr: "CHF", franchi: "CHF", euro: "EUR", dollari: "USD", sterline: "GBP" }

/** "chf", "€", "dollari" → ISO code, or null. */
export function parseCurrency(token: string | undefined): Currency | null {
  if (!token) return null
  const t = token.trim().toLowerCase()
  if (SYMBOLS[t]) return SYMBOLS[t]
  const code = t.toUpperCase()
  return (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null
}
