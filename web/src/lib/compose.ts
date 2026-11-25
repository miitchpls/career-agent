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
import { POSTED, SITES, type FilterState } from "@/lib/filters"
import { msgs } from "@/lib/i18n"
import { DEFAULT_CURRENCY, formatAmount, parseCurrency, parseSalary, salaryRangeK, type Currency } from "@/lib/currencies"
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

// What users may type, in any of the UI languages (the parser doesn't depend on the locale).
const MODE_WORDS: [KnownMode, string[]][] = [
  ["onsite", ["in sede", "sede", "onsite", "on-site", "on site", "ufficio", "in presenza", "presenza", "office", "in office", "vor ort", "büro", "사무실", "사무실 근무", "출근", "상주", "au bureau", "di kantor", "en la oficina", "kantor", "no escritório", "ofiste", "op kantoor", "op locatie", "presencial", "sur place", "sur site", "yerinde", "в офисе", "офис", "オフィス", "出社", "坐班", "现场", "线下"]],
  ["hybrid", ["ibrido", "ibrida", "hybrid", "smart working", "하이브리드", "혼합 근무", "híbrido", "hibrido", "hybride", "hibrit", "hibrida", "гибрид", "гибридный", "ハイブリッド", "混合办公", "混合"]],
  ["remote", ["remoto", "remota", "da remoto", "remote", "full remote", "telelavoro", "homeoffice", "home office", "원격", "원격 근무", "재택", "재택근무", "리모트", "en remoto", "evden", "jarak jauh", "op afstand", "remoto", "teletrabajo", "thuiswerk", "trabalho remoto", "télétravail", "uzaktan", "wfh", "à distance", "удаленно", "удалёнка", "удалённо", "リモート", "在宅", "居家办公", "远程"]],
]
const OR_WORDS = ["o", "or", "oppure", "oder", "또는", "ou", "of", "veya", "atau", "или", "または", "或", "或者", "|"]
const ANYWHERE_WORDS = ["ovunque", "everywhere", "anywhere", "worldwide", "tutto il mondo", "überall", "weltweit", "어디서나", "전 세계", "전세계", "en cualquier lugar", "todo el mundo", "n'importe où", "monde entier", "qualquer lugar", "mundo todo", "overal", "wereldwijd", "her yer", "dünya çapında", "di mana saja", "seluruh dunia", "везде", "весь мир", "どこでも", "世界中", "任何地方", "全球"]
const POSTED_WORDS: [number, string[]][] = [
  [24, ["oggi", "24h", "24 ore", "ultime 24 ore", "1g", "1 giorno", "today", "last 24 hours", "heute", "letzte 24 stunden", "오늘", "24시간", "최근 24시간", "hoy", "aujourd'hui", "hoje", "vandaag", "bugün", "hari ini", "сегодня", "今日", "今天"]],
  [72, ["3g", "3 giorni", "ultimi 3 giorni", "3 days", "last 3 days", "3 tage", "letzte 3 tage", "3일", "최근 3일", "3 días", "3 jours", "3 dias", "3 dagen", "3 gün", "3 hari", "3 дня", "3日", "3天"]],
  [168, ["settimana", "7g", "7 giorni", "1 settimana", "ultimi 7 giorni", "ultima settimana", "week", "last week", "last 7 days", "woche", "letzte woche", "letzte 7 tage", "1주", "일주일", "최근 1주", "최근 7일", "semana", "última semana", "semaine", "dernière semaine", "week", "afgelopen week", "hafta", "son hafta", "minggu", "minggu ini", "неделя", "за неделю", "1週間", "一周", "最近一周"]],
  [336, ["2 settimane", "14g", "14 giorni", "ultime 2 settimane", "2 weeks", "last 2 weeks", "2 wochen", "letzte 2 wochen", "2주", "최근 2주", "2 semanas", "2 semaines", "2 weken", "2 hafta", "2 minggu", "2 недели", "2週間", "两周"]],
  [720, ["mese", "30g", "30 giorni", "1 mese", "ultimo mese", "ultimi 30 giorni", "month", "last month", "last 30 days", "monat", "letzter monat", "letzte 30 tage", "1개월", "한 달", "최근 1개월", "최근 30일", "mes", "último mes", "mois", "dernier mois", "mês", "último mês", "maand", "afgelopen maand", "ay", "son ay", "bulan", "bulan ini", "месяц", "за месяц", "1ヶ月", "一个月", "最近一个月"]],
]
/** Starts of "ultimi…", "last…", "letzte…", "최근…": typing one lists every date choice. */
const LAST = /^(ultim|last|letzt|최근|derni|afgelopen|son |последн|最近)/
const SALARY_WORDS = ["stipendio", "ral", "salary", "gehalt", "lohn", "연봉", "급여", "salario", "sueldo", "salaire", "salário", "salaris", "maaş", "gaji", "зарплата", "給与", "年収", "薪资", "工资"]

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

export const draftLabel = (kind: DraftKind) => (kind === "title" ? msgs().suggest.titleContains : msgs().suggest.textContains)

/** What committing a draft chip with `text` does. */
export function commitDraft(f: FilterState, kind: DraftKind, text: string): Patch | null {
  const t = text.trim()
  if (!t) return null
  if (kind === "title") return ops.addTitle(f, t)
  return { q: t }
}

export function placeLabel(o: Pick<PlaceOption, "city" | "region" | "country_name">): string {
  return [o.city, o.region !== o.city ? o.region : null, o.country_name].filter(Boolean).join(", ")
}

export function suggest(
  text: string,
  f: FilterState,
  newGroup: boolean,
  places: PlaceOption[] = [],
): Suggestion[] {
  const tr = msgs().suggest
  const raw = text.trim()
  const t = raw.toLowerCase()
  if (!t) return idleSuggestions(f, newGroup)

  const out: Suggestion[] = []
  const hasScopes = f.where.length > 0

  if (OR_WORDS.includes(t) && hasScopes)
    out.push({ id: "or", icon: GitForkIcon, label: tr.orAlternative, hint: tr.orAlternativeHint, patch: null, keepGroup: true })

  // "100.000", "100'000 chf", "80k", "stipendio 90", "€ 80k", "120000 dollari", "80k l'anno"
  const sal =
    /^(?:stipendio|ral|salary|gehalt|lohn|연봉|급여|>=?|≥|da|from|ab)?\s*([€$£])?\s*(\d{1,3}(?:[.,'’ ]\d{3})+|\d{2,11})\s*(k(?![a-z])|mila|tsd)?\s*([a-z€$£]{1,8})?\s*(?:\/\s*(?:anno|year|jahr)|annui|l'anno|a year|per year|pro jahr)?$/i.exec(t)
  let salCur: Currency | null = sal?.[4] ? parseCurrency(sal[4]) : sal?.[1] ? parseCurrency(sal[1]) : null
  let amount = sal && (!sal[4] || salCur) ? parseSalary(`${sal[2]}${sal[3] ?? ""}`, salCur ?? f.cur) : null
  // Won, as Koreans write it: "연봉 6000만", "6천만원", "1억 2천만", "₩60,000,000", "60,000,000원".
  const won = /^(?:연봉|급여)?\s*(₩)?\s*([\d.,\s]+(?:천)?[만억]?[\d.,\s천만]*)\s*(원)?$/.exec(t)
  if (amount === null && won && (won[1] || won[3] || /[만억]/.test(won[2]))) {
    amount = parseSalary(won[2].trim(), "KRW")
    salCur = "KRW"
  }
  if (amount !== null) {
    const n = Math.round(amount / 1000)
    const cur = salCur ?? f.cur
    const [lo, hi] = salaryRangeK(cur)
    if (n >= lo && n <= hi)
      out.push({
        id: `salary:${n}:${cur}`,
        icon: CoinsIcon,
        label: tr.salary(formatAmount(n * 1000, cur), cur),
        hint: tr.salaryHint,
        patch: { salary: n, cur: cur === DEFAULT_CURRENCY ? null : cur },
      })
  } else if (prefixOf(t, SALARY_WORDS)) {
    out.push({ id: "salary-panel", icon: CoinsIcon, label: tr.salaryPanel, hint: tr.salaryPanelHint, patch: null, panel: "salary" })
  }

  for (const [hours, words] of POSTED_WORDS) {
    if (words.some((w) => w === t) || (LAST.test(t) && t.length >= 4 && words.some((w) => w.startsWith(t))))
      out.push({ id: `posted:${hours}`, icon: CalendarIcon, label: msgs().posted[hours], patch: { posted: hours } })
  }
  if (LAST.test(t) && !out.some((s) => s.id.startsWith("posted")))
    for (const h of POSTED) out.push({ id: `posted:${h}`, icon: CalendarIcon, label: msgs().posted[h], patch: { posted: h } })

  for (const [mode, words] of MODE_WORDS)
    if (prefixOf(t, words))
      out.push({ id: `mode:${mode}`, icon: HouseIcon, label: msgs().modes[mode], hint: newGroup ? tr.inAlternative : !hasScopes ? tr.mode : tr.modeOfPlace, patch: ops.addMode(f, mode, newGroup) })

  if (prefixOf(t, ANYWHERE_WORDS))
    out.push({ id: "anywhere", icon: GlobeIcon, label: msgs().common.anywhere, hint: tr.anywhereHint, patch: ops.setAnywhere(f, newGroup) })

  for (const jt of JOB_TYPES)
    if (!f.jt.includes(jt.value) && (prefixOf(t, jt.words) || jt.words.includes(t)))
      out.push({ id: `jt:${jt.value}`, icon: BriefcaseBusinessIcon, label: tr.jobType(msgs().jobTypes[jt.value]), patch: ops.addJobType(f, jt.value) })
  if (prefixOf(t, ["tipo di impiego", "impiego", "contratto di lavoro", "job type", "employment", "anstellung", "beschäftigung"]))
    out.push({ id: "jobtype-panel", icon: BriefcaseBusinessIcon, label: tr.jobTypePanel, patch: null, panel: "jobtype" })

  for (const s of SITES)
    if (prefixOf(t, [s.value]) && !f.sites.includes(s.value))
      out.push({ id: `site:${s.value}`, icon: BriefcaseIcon, label: tr.onlySite(s.label), hint: tr.site, patch: ops.addSite(f, s.value) })

  const cityItems: Suggestion[] = places.map((o) => ({
    id: `place:${o.geo_id ?? `${o.city}:${o.country}`}`,
    icon: MapPinIcon,
    label: placeLabel(o),
    hint: newGroup ? tr.inAlternative : hasScopes ? tr.addToPlace : tr.place,
    patch: ops.addPlace(f, toPlace(o), newGroup),
  }))
  const keyword: Suggestion = {
    id: `title:${t}`,
    icon: TypeIcon,
    label: tr.titleQuoted(raw),
    hint: f.title.length ? tr.titleOther : tr.titleHint,
    patch: ops.addTitle(f, raw),
    keepGroup: newGroup,
  }
  // The two filters any word can be come first, always: a place the geocoder matched by
  // spelling ("engineer" finds a village somewhere) is the less likely reading.
  out.push(keyword, { id: `q:${t}`, icon: TextSearchIcon, label: tr.textQuoted(raw), hint: tr.textHint, patch: { q: raw }, keepGroup: newGroup })
  out.push(...cityItems.slice(0, 5))
  return out
}

function idleSuggestions(f: FilterState, newGroup: boolean): Suggestion[] {
  const tr = msgs().suggest
  // Same two filters offered when typing, first: they open a chip to type into.
  const out: Suggestion[] = [
    { id: "draft:title", icon: TypeIcon, label: `${tr.titleContains}…`, hint: tr.titleHint, patch: null, draft: "title", keepGroup: newGroup },
    { id: "draft:q", icon: TextSearchIcon, label: `${tr.textContains}…`, hint: tr.textHint, patch: null, draft: "q", keepGroup: newGroup },
  ]
  if (f.where.length && !newGroup)
    out.push({ id: "or", icon: GitForkIcon, label: tr.or, hint: tr.orHint, patch: null, keepGroup: true })
  if (!f.where.length || newGroup)
    out.push({ id: "anywhere", icon: GlobeIcon, label: msgs().common.anywhere, patch: ops.setAnywhere(f, newGroup) })
  for (const [mode] of MODE_WORDS)
    if (!f.where.at(-1)?.modes.includes(mode) || newGroup)
      out.push({ id: `mode:${mode}`, icon: HouseIcon, label: msgs().modes[mode], hint: tr.mode, patch: ops.addMode(f, mode, newGroup) })
  if (f.salary === null) out.push({ id: "salary-panel", icon: CoinsIcon, label: tr.salaryPanel, patch: null, panel: "salary" })
  if (!f.jt.length) out.push({ id: "jobtype-panel", icon: BriefcaseBusinessIcon, label: tr.jobTypePanel, hint: tr.jobTypePanelHint, patch: null, panel: "jobtype" })
  if (f.posted === null) out.push({ id: "posted-panel", icon: CalendarIcon, label: tr.postedPanel, patch: null, panel: "posted" })
  return out
}
