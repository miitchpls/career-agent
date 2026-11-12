import {
  createParser,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs"

import type { Query, Scope, Site, WorkMode } from "@/lib/api"
import { CURRENCIES, DEFAULT_CURRENCY, parseCurrency } from "@/lib/currencies"

export const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: "onsite", label: "In sede" },
  { value: "hybrid", label: "Ibrido" },
  { value: "remote", label: "Remoto" },
  { value: "unknown", label: "Non specificata" },
]
export const MODE_LABEL = Object.fromEntries(WORK_MODES.map((m) => [m.value, m.label])) as Record<
  WorkMode,
  string
>

export const SITES: { value: Site; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
]

export const POSTED: { value: number; label: string }[] = [
  { value: 24, label: "Ultime 24 ore" },
  { value: 72, label: "Ultimi 3 giorni" },
  { value: 168, label: "Ultimi 7 giorni" },
  { value: 336, label: "Ultime 2 settimane" },
  { value: 720, label: "Ultimi 30 giorni" },
]

const MODE_VALUES = new Set<string>(WORK_MODES.map((m) => m.value))

/**
 * Scopes in the URL, readable on purpose:
 *   where=Zurigo:ch:2657896:Zurigo,Basilea:ch~onsite.hybrid|*~remote
 * Places are city:country:geo_id:region, each field URI-encoded.
 * "|" separates OR-ed scopes, "~" splits places from modes, "*" means anywhere.
 */
// encodeURIComponent leaves ~ . * unescaped; they're separators here, so escape them too.
const enc = (v: string) => encodeURIComponent(v).replace(/[~.*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)

export function serializeScopes(scopes: Scope[]): string {
  return scopes
    .map((s) => {
      const where = s.anywhere
        ? "*"
        : s.places
            .map((p) => [enc(p.city), p.country, p.geo_id ?? "", enc(p.region ?? "")].join(":").replace(/:+$/, ""))
            .join(",")
      return s.modes.length ? `${where}~${s.modes.join(".")}` : where
    })
    .join("|")
}

/** Inverse of serializeScopes; `null` for an empty or malformed value (e.g. a hand-edited URL). */
export function parseScopes(value: string): Scope[] | null {
  try {
    const scopes = value
      .split("|")
      .filter(Boolean)
      .map((chunk): Scope => {
        const [where = "", modes = ""] = chunk.split("~")
        const anywhere = where === "*"
        const places = anywhere
          ? []
          : where
              .split(",")
              .filter(Boolean)
              .map((p) => {
                const [city = "", country = "it", geo = "", region = ""] = p.split(":").map(decodeURIComponent)
                return { city, country, region: region || null, geo_id: geo ? Number(geo) : null }
              })
        return {
          anywhere: anywhere || places.length === 0,
          places,
          modes: modes.split(".").filter((m): m is WorkMode => MODE_VALUES.has(m)),
        }
      })
    return scopes.length ? scopes : null
  } catch {
    return null // URIError from a broken %-escape
  }
}

const parseAsScopes = createParser<Scope[]>({
  parse: parseScopes,
  serialize: serializeScopes,
  eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
})

const filterParsers = {
  where: parseAsScopes.withDefault([]),
  title: parseAsArrayOf(parseAsString).withDefault([]),
  salary: parseAsInteger,
  nosalary: parseAsBoolean.withDefault(true),
  cur: parseAsStringLiteral(CURRENCIES).withDefault(DEFAULT_CURRENCY),
  posted: parseAsInteger,
  jt: parseAsArrayOf(parseAsStringLiteral(["fulltime", "parttime", "contract", "internship", "volunteer"] as const)).withDefault([]),
  jtnull: parseAsBoolean.withDefault(true),
  sites: parseAsArrayOf(parseAsStringLiteral(["linkedin", "indeed"] as const)).withDefault([]),
  q: parseAsString.withDefault(""),
  // Sorting is set from the table headers; old links with sort=added fall back to the default.
  sort: parseAsStringLiteral(["posted", "salary"] as const).withDefault("posted"),
  dir: parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
}

/** Keys that count as "a filter" (excludes free-text search and sort, like Grabbit). */
const FILTER_KEYS = ["where", "title", "jt", "salary", "posted", "sites"] as const
type FilterKey = (typeof FILTER_KEYS)[number]

/** Filter state with nothing set (the parsers' defaults). */
export const DEFAULT_FILTERS: FilterState = Object.fromEntries(
  Object.entries(filterParsers).map(([k, p]) => [k, "defaultValue" in p ? p.defaultValue : null]),
) as FilterState

/** A query with no filters. */
export const EMPTY_QUERY: Query = {
  scopes: [],
  title_any: [],
  title_none: [],
  salary_min: null,
  salary_currency: DEFAULT_CURRENCY,
  salary_unknown: true,
  posted_within: null,
  job_types: [],
  job_type_unknown: true,
  sites: [],
  search: "",
}

export function useFilters() {
  return useQueryStates(filterParsers, { history: "replace", throttleMs: 300 })
}

export type FilterState = ReturnType<typeof useFilters>[0]

export function toQuery(f: FilterState): Query {
  return {
    scopes: f.where,
    title_any: f.title,
    title_none: [], // title exclusions: supported by the API, not exposed in the UI for now
    salary_min: f.salary,
    salary_currency: f.cur,
    salary_unknown: f.nosalary,
    posted_within: f.posted,
    job_types: f.jt,
    job_type_unknown: f.jtnull,
    sites: f.sites,
    search: f.q,
  }
}

function isActive(f: FilterState, key: FilterKey): boolean {
  const v = f[key]
  return Array.isArray(v) ? v.length > 0 : v !== null
}

export function activeCount(f: FilterState): number {
  return FILTER_KEYS.filter((k) => isActive(f, k)).length
}

export const CLEARED = {
  where: null,
  title: null,
  salary: null,
  nosalary: null,
  cur: null,
  posted: null,
  jt: null,
  jtnull: null,
  sites: null,
} as const

/** Inverse of toQuery: the URL patch that loads a saved query into the composer. */
export function fromQuery(q: Query) {
  return {
    where: q.scopes.length ? q.scopes : null,
    title: q.title_any.length ? q.title_any : null,
    salary: q.salary_min,
    nosalary: q.salary_min === null ? null : q.salary_unknown,
    cur: q.salary_min === null || q.salary_currency === DEFAULT_CURRENCY ? null : (parseCurrency(q.salary_currency) ?? null),
    posted: q.posted_within,
    jt: q.job_types?.length ? q.job_types : null,
    jtnull: q.job_types?.length ? q.job_type_unknown : null,
    sites: q.sites.length ? q.sites : null,
    q: q.search || null,
  }
}

/** Order-independent comparison of two queries. */
export function sameQuery(a: Query, b: Query): boolean {
  const norm = (q: Query) =>
    JSON.stringify(
      {
        ...q,
        // Salary options mean nothing without a salary filter.
        salary_unknown: q.salary_min === null ? true : q.salary_unknown,
        salary_currency: q.salary_min === null ? DEFAULT_CURRENCY : (q.salary_currency ?? DEFAULT_CURRENCY),
        job_types: q.job_types ?? [],
        job_type_unknown: q.job_types?.length ? q.job_type_unknown : true,
      },
      (_, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
        : v,
    )
  return norm(a) === norm(b)
}
