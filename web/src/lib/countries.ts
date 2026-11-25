/**
 * Countries, from the browser's own data (Intl.DisplayNames) rather than a list kept here:
 * every ISO 3166-1 code, named in any language, and read back from a board's location.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
// Codes Intl names that aren't countries a job is in.
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "XA", "XB", "ZZ", "QO", "AQ"])

let codes: string[] | null = null

/** Every country code ("it", "ch"…), lowercase. */
export function countryCodes(): string[] {
  if (codes) return codes
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" })
  const out: string[] = []
  for (const a of LETTERS)
    for (const b of LETTERS) {
      const code = a + b
      if (!NOT_COUNTRIES.has(code) && names.of(code)) out.push(code.toLowerCase())
    }
  codes = out
  return out
}

const displayNames = new Map<string, Intl.DisplayNames>()

/** "Switzerland", "Svizzera", "スイス": the country's name in `locale`. */
export function countryName(code: string, locale: string): string {
  let names = displayNames.get(locale)
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: "region", fallback: "code" })
    displayNames.set(locale, names)
  }
  return names.of(code.toUpperCase()) ?? code.toUpperCase()
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.\s]+/g, " ")
    .trim()

// The languages boards write locations in, for reading them back.
const NAME_LANGUAGES = ["en", "it", "de", "fr", "es", "pt", "nl", "tr", "id", "ru", "ja", "zh", "ko"]
// What boards write that no country name is.
const ALIASES: Record<string, string> = {
  usa: "us",
  "u s": "us",
  "u s a": "us",
  uk: "gb",
  england: "gb",
  scotland: "gb",
  wales: "gb",
  "south korea": "kr",
  korea: "kr",
  "republic of korea": "kr",
  대한민국: "kr",
  한국: "kr",
  schweiz: "ch",
  suisse: "ch",
  svizzera: "ch",
}

// "Boston, MA": with no country after it, a US state or Canadian province code, as Indeed writes
// them, not the country with that code (Morocco). Only provinces whose codes no country has.
const US_STATES = new Set(
  "al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(" "),
)
const CA_PROVINCES = new Set("ab bc mb nb ns nt nu on qc yt".split(" "))

let byName: Map<string, string> | null = null

function nameIndex(): Map<string, string> {
  if (byName) return byName
  // Folded like what they're compared with (NFKD splits Hangul into jamo, for one).
  const index = new Map<string, string>(Object.entries(ALIASES).map(([k, v]) => [fold(k), v]))
  for (const lang of NAME_LANGUAGES) {
    const names = new Intl.DisplayNames([lang], { type: "region", fallback: "none" })
    for (const code of countryCodes()) {
      const name = names.of(code.toUpperCase())
      if (name && !index.has(fold(name))) index.set(fold(name), code)
    }
  }
  byName = index
  return index
}

/**
 * The country at the end of a board's location ("Zurich, ZH, Switzerland", "Milano, Italia",
 * "Austin, TX, US", "Boston, MA"), by name in any of the boards' languages or by its code; null
 * when the location doesn't say ("Remote").
 */
export function countryOf(location: string | null): string | null {
  const parts = (location ?? "").split(",").map(fold).filter(Boolean)
  const last = parts.at(-1)
  if (!last) return null
  const named = nameIndex().get(last)
  if (named) return named
  // A two-letter code, but only after a comma: "Remote" alone isn't Romania's "ro".
  if (parts.length < 2 || !/^[a-z]{2}$/.test(last)) return null
  if (parts.length === 2 && US_STATES.has(last)) return "us"
  if (parts.length === 2 && CA_PROVINCES.has(last)) return "ca"
  return countryCodes().includes(last) ? last : null
}
