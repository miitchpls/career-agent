import {
  BriefcaseBusinessIcon,
  BriefcaseIcon,
  CalendarIcon,
  CoinsIcon,
  GitForkIcon,
  GlobeIcon,
  HouseIcon,
  MapPinIcon,
  TextSearchIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react"

import type { JobType, Place, PlaceOption, Scope, Site } from "@/lib/api"
import { MODE_LABEL, POSTED, SITES, type FilterState } from "@/lib/filters"
import { DEFAULT_CURRENCY, formatAmount, parseCurrency, parseSalary } from "@/lib/currencies"
import { JOB_TYPES } from "@/lib/job-types"
import { joinModes, splitModes, type KnownMode } from "@/lib/modes"
import { samePlace, toPlace } from "@/lib/places"

export type Patch = Partial<{ [K in keyof FilterState]: FilterState[K] | null }>

/* ------------------------------------------------------------------ state ops
 * `newGroup` = the user asked for "OR": the next place/mode opens a new scope. */

function withScope(f: FilterState, newGroup: boolean, edit: (s: Scope | null) => Scope): Patch {
  const last = f.where.at(-1)
  if (newGroup || !last) return { where: [...f.where, edit(null)] }
  return { where: [...f.where.slice(0, -1), edit(last)] }
}

const ops = {
  addPlace: (f: FilterState, p: Place, newGroup: boolean) =>
    withScope(f, newGroup, (s) =>
      s && !s.anywhere
        ? s.places.some((x) => samePlace(x, p))
          ? s
          : { ...s, places: [...s.places, p] }
        : { anywhere: false, places: [p], modes: s?.modes ?? [] },
    ),
  setAnywhere: (f: FilterState, newGroup: boolean) =>
    withScope(f, newGroup, (s) => ({ anywhere: true, places: [], modes: s?.modes ?? [] })),
  addMode: (f: FilterState, m: KnownMode, newGroup: boolean) =>
    withScope(f, newGroup, (s) => {
      // Same default as the editors: postings with no stated mode stay in unless switched off.
      const { known, includeUnknown } = splitModes(s?.modes ?? [])
      const modes = joinModes(known.includes(m) ? known : [...known, m], includeUnknown)
      return s ? { ...s, modes } : { anywhere: true, places: [], modes }
    }),
  addTitle: (f: FilterState, t: string): Patch => ({ title: [...new Set([...f.title, t.toLowerCase()])] }),
  addSite: (f: FilterState, s: Site): Patch => ({ sites: [...new Set([...f.sites, s])] }),
  addJobType: (f: FilterState, t: JobType): Patch => ({ jt: [...new Set([...f.jt, t])] }),
}

/** Remove the right-most piece of the sentence (Backspace on an empty input). */
export function removeLast(f: FilterState): Patch | null {
  if (f.q) return { q: null }
  if (f.sites.length) return { sites: f.sites.slice(0, -1) }
  if (f.posted !== null) return { posted: null }
  if (f.salary !== null) return { salary: null, nosalary: null, cur: null }
  if (f.jt.length) return f.jt.length > 1 ? { jt: f.jt.slice(0, -1) } : { jt: null, jtnull: null }
  const last = f.where.at(-1)
  if (last) {
    const rest = f.where.slice(0, -1)
    if (last.modes.length) {
      const { known, includeUnknown } = splitModes(last.modes)
      return { where: [...rest, { ...last, modes: joinModes(known.slice(0, -1), includeUnknown) }] }
    }
    if (!last.anywhere && last.places.length > 1)
      return { where: [...rest, { ...last, places: last.places.slice(0, -1) }] }
    return { where: rest }
  }
  if (f.title.length) return { title: f.title.slice(0, -1) }
  return null
}

/* ------------------------------------------------------------------ parsing */

const MODE_WORDS: [KnownMode, string[]][] = [
  ["onsite", ["in sede", "sede", "onsite", "on-site", "on site", "ufficio", "in presenza", "presenza"]],
  ["hybrid", ["ibrido", "ibrida", "hybrid", "smart working"]],
  ["remote", ["remoto", "remota", "da remoto", "remote", "full remote", "telelavoro"]],
]
const OR_WORDS = ["o", "or", "oppure", "|"]
const ANYWHERE_WORDS = ["ovunque", "everywhere", "anywhere", "worldwide", "tutto il mondo"]
const POSTED_WORDS: [number, string[]][] = [
  [24, ["oggi", "24h", "24 ore", "ultime 24 ore", "1g", "1 giorno"]],
  [72, ["3g", "3 giorni", "ultimi 3 giorni"]],
  [168, ["settimana", "7g", "7 giorni", "1 settimana", "ultimi 7 giorni", "ultima settimana"]],
  [336, ["2 settimane", "14g", "14 giorni", "ultime 2 settimane"]],
  [720, ["mese", "30g", "30 giorni", "1 mese", "ultimo mese", "ultimi 30 giorni"]],
]

const prefixOf = (t: string, words: string[]) => t.length >= 2 && words.some((w) => w.startsWith(t))

export interface Suggestion {
  id: string
  icon: LucideIcon
  label: string
  value?: string
  hint?: string
  /** Patch to apply; `null` means "only toggles OR mode". */
  patch: Patch | null
  /** Whether the next place/mode should still open a new OR group. */
  keepGroup?: boolean
  /** Instead of applying, open an empty chip of this kind to type into. */
  draft?: DraftKind
  /** Instead of applying, open this filter's editor under the bar. */
  panel?: Panel
}

/** Filters edited in a panel under the bar rather than typed. */
export type Panel = "scope" | "salary" | "posted" | "jobtype"

/** A chip being typed: "Titolo contiene …" or "Testo contiene …". */
export type DraftKind = "title" | "q"

export const DRAFT_LABEL: Record<DraftKind, string> = {
  title: "Titolo contiene",
  q: "Testo contiene",
}

/** What committing a draft chip with `text` does. */
export function commitDraft(f: FilterState, kind: DraftKind, text: string): Patch | null {
  const t = text.trim()
  if (!t) return null
  if (kind === "title") return ops.addTitle(f, t)
  return { q: t }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()

export function placeLabel(o: Pick<PlaceOption, "city" | "region" | "country_name">): string {
  return [o.city, o.region !== o.city ? o.region : null, o.country_name].filter(Boolean).join(", ")
}

export function suggest(
  text: string,
  f: FilterState,
  newGroup: boolean,
  places: PlaceOption[] = [],
): Suggestion[] {
  const raw = text.trim()
  const t = raw.toLowerCase()
  if (!t) return idleSuggestions(f, newGroup)

  const out: Suggestion[] = []
  const hasScopes = f.where.length > 0

  if (OR_WORDS.includes(t) && hasScopes)
    out.push({ id: "or", icon: GitForkIcon, label: "Aggiungi un'alternativa: oppure…", hint: "es. … oppure ovunque da remoto", patch: null, keepGroup: true })

  // "100.000", "100'000 chf", "80k", "stipendio 90", "€ 80k", "120000 dollari", "80k l'anno"
  const sal =
    /^(?:stipendio|ral|salary|>=?|≥|da)?\s*([€$£])?\s*(\d{1,3}(?:[.'’ ]\d{3})+|\d{2,7})\s*(k|mila)?\s*([a-z€$£]{1,8})?\s*(?:\/\s*anno|annui|l'anno)?$/i.exec(t)
  const salCur = sal?.[4] ? parseCurrency(sal[4]) : sal?.[1] ? parseCurrency(sal[1]) : null
  const amount = sal && (!sal[4] || salCur) ? parseSalary(`${sal[2]}${sal[3] ?? ""}`) : null
  if (amount !== null) {
    const n = Math.round(amount / 1000)
    const cur = salCur ?? f.cur
    if (n >= 10 && n <= 10_000)
      out.push({
        id: `salary:${n}:${cur}`,
        icon: CoinsIcon,
        label: `Stipendio ≥ ${formatAmount(n * 1000)} ${cur} / anno`,
        hint: "le altre valute vengono convertite",
        patch: { salary: n, cur: cur === DEFAULT_CURRENCY ? null : cur },
      })
  } else if (prefixOf(t, ["stipendio", "ral", "salary"])) {
    out.push({ id: "salary-panel", icon: CoinsIcon, label: "Stipendio minimo…", hint: "o scrivi una cifra, es. 100.000", patch: null, panel: "salary" })
  }

  for (const [hours, words] of POSTED_WORDS) {
    if (words.some((w) => w === t) || (t.startsWith("ultim") && t.length >= 5 && words.some((w) => w.startsWith(t))))
      out.push({ id: `posted:${hours}`, icon: CalendarIcon, label: POSTED.find((p) => p.value === hours)!.label, patch: { posted: hours } })
  }
  if (t.startsWith("ultim") && !out.some((s) => s.id.startsWith("posted")))
    for (const p of POSTED) out.push({ id: `posted:${p.value}`, icon: CalendarIcon, label: p.label, patch: { posted: p.value } })

  for (const [mode, words] of MODE_WORDS)
    if (prefixOf(t, words))
      out.push({ id: `mode:${mode}`, icon: HouseIcon, label: MODE_LABEL[mode], hint: newGroup ? "nell'alternativa" : !hasScopes ? "modalità" : "modalità del luogo", patch: ops.addMode(f, mode, newGroup) })

  if (prefixOf(t, ANYWHERE_WORDS))
    out.push({ id: "anywhere", icon: GlobeIcon, label: "Ovunque", hint: "nessun vincolo di luogo", patch: ops.setAnywhere(f, newGroup) })

  for (const jt of JOB_TYPES)
    if (!f.jt.includes(jt.value) && (prefixOf(t, jt.words) || jt.words.includes(t)))
      out.push({ id: `jt:${jt.value}`, icon: BriefcaseBusinessIcon, label: `Tipo di impiego: ${jt.label}`, patch: ops.addJobType(f, jt.value) })
  if (prefixOf(t, ["tipo di impiego", "impiego", "contratto di lavoro"]))
    out.push({ id: "jobtype-panel", icon: BriefcaseBusinessIcon, label: "Tipo di impiego…", patch: null, panel: "jobtype" })

  for (const s of SITES)
    if (prefixOf(t, [s.value]) && !f.sites.includes(s.value))
      out.push({ id: `site:${s.value}`, icon: BriefcaseIcon, label: `Solo ${s.label}`, hint: "portale", patch: ops.addSite(f, s.value) })

  const cityItems: Suggestion[] = places.map((o) => ({
    id: `place:${o.geo_id ?? `${o.city}:${o.country}`}`,
    icon: MapPinIcon,
    label: placeLabel(o),
    hint: newGroup ? "nell'alternativa" : hasScopes ? "aggiungi al luogo" : "luogo",
    patch: ops.addPlace(f, toPlace(o), newGroup),
  }))
  const keyword: Suggestion = {
    id: `title:${t}`,
    icon: TypeIcon,
    label: `Titolo contiene «${raw}»`,
    hint: f.title.length ? "in alternativa alle altre" : "termine cercato sui portali",
    patch: ops.addTitle(f, raw),
    keepGroup: newGroup,
  }
  const command = out.length > 0
  const exactCity = places.some((o) => norm(o.city) === norm(raw))
  // A city that matches what was typed (or a prefix with nothing else to suggest) goes first.
  if (cityItems.length && (exactCity || !command)) out.push(...cityItems.slice(0, 5), keyword)
  else out.push(keyword, ...cityItems.slice(0, 5))

  out.push({ id: `q:${t}`, icon: TextSearchIcon, label: `Testo contiene «${raw}»`, hint: "titolo, azienda e descrizione", patch: { q: raw }, keepGroup: newGroup })
  return out
}

function idleSuggestions(f: FilterState, newGroup: boolean): Suggestion[] {
  // Same two filters offered when typing, first: they open a chip to type into.
  const out: Suggestion[] = [
    { id: "draft:title", icon: TypeIcon, label: `${DRAFT_LABEL.title}…`, hint: "termine cercato sui portali", patch: null, draft: "title", keepGroup: newGroup },
    { id: "draft:q", icon: TextSearchIcon, label: `${DRAFT_LABEL.q}…`, hint: "titolo, azienda e descrizione", patch: null, draft: "q", keepGroup: newGroup },
  ]
  if (f.where.length && !newGroup)
    out.push({ id: "or", icon: GitForkIcon, label: "Oppure…", hint: "aggiungi un'alternativa di luogo e modalità", patch: null, keepGroup: true })
  if (!f.where.length || newGroup)
    out.push({ id: "anywhere", icon: GlobeIcon, label: "Ovunque", patch: ops.setAnywhere(f, newGroup) })
  for (const [mode] of MODE_WORDS)
    if (!f.where.at(-1)?.modes.includes(mode) || newGroup)
      out.push({ id: `mode:${mode}`, icon: HouseIcon, label: MODE_LABEL[mode], hint: "modalità", patch: ops.addMode(f, mode, newGroup) })
  if (f.salary === null) out.push({ id: "salary-panel", icon: CoinsIcon, label: "Stipendio minimo…", patch: null, panel: "salary" })
  if (!f.jt.length) out.push({ id: "jobtype-panel", icon: BriefcaseBusinessIcon, label: "Tipo di impiego…", hint: "full time, part time, tirocinio…", patch: null, panel: "jobtype" })
  if (f.posted === null) out.push({ id: "posted-panel", icon: CalendarIcon, label: "Pubblicate negli ultimi…", patch: null, panel: "posted" })
  return out
}
