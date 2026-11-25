/** CV preferences (saved by the server) and what they mean for one posting. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type CvLanguage, type CvPrefs, type Job } from "@/lib/api"
import { countryOf } from "@/lib/countries"
import { msgs } from "@/lib/i18n"

export const DEFAULT_CV_PREFS: CvPrefs = {
  language: "job",
  format: "auto",
  style: "standard",
  photo: "auto",
  photoStyle: "circle",
  footer: "",
  footerCountries: [],
  locked: [],
  guidance: "",
}

const prefsQuery = { queryKey: ["cv-prefs"], queryFn: api.cv.prefs, staleTime: Infinity }

export function useCvPrefs(): CvPrefs {
  const { data } = useQuery(prefsQuery)
  return data ?? DEFAULT_CV_PREFS
}

/** Whether the saved preferences have arrived (or failed to): until then the defaults are a guess. */
export function useCvPrefsReady(): boolean {
  return !useQuery(prefsQuery).isPending
}

/**
 * Saves a change to some preferences. It applies at once; a failed save puts the previous value
 * back. The rest is what the server holds (read first if it isn't loaded yet), never the
 * defaults shown while loading, so a change made early can't reset the others.
 */
export function useSaveCvPrefs() {
  const client = useQueryClient()
  const key = ["cv-prefs"]
  return useMutation({
    scope: { id: "cv-prefs" }, // one after the other, so the last change is the one stored
    mutationFn: async (patch: Partial<CvPrefs>) => {
      const base = client.getQueryData<CvPrefs>(key) ?? (await client.fetchQuery({ queryKey: key, queryFn: api.cv.prefs }))
      return api.cv.savePrefs({ ...base, ...patch } as CvPrefs)
    },
    onMutate: (patch) => {
      const before = client.getQueryData<CvPrefs>(key)
      if (before) client.setQueryData(key, { ...before, ...patch } as CvPrefs)
      return { before }
    },
    onSuccess: (saved) => client.setQueryData(key, saved),
    onError: (e, _patch, ctx) => {
      if (ctx?.before) client.setQueryData(key, ctx.before)
      toast.error(msgs().profile.saveFailed, { description: e.message })
    },
  })
}

// --- Resolving "auto" for a posting -------------------------------------------------------------

/** ISO code of the posting's country, from the end of its location ("Zurich, ZH, Switzerland"). */
export const jobCountry = countryOf

// Where the page is Letter, and where a CV without a photo is the norm (anti-discrimination
// practice). Elsewhere in Europe a photo is common.
const LETTER = new Set(["us", "ca"])
const NO_PHOTO = new Set(["us", "ca", "gb", "ie"])

// Common words of the languages written in Latin letters, ten each: the most frequent wins.
// Words common in one language's postings and in none of the others' (the test checks they stay
// apart): a word two languages share, like "de" or "di", would vote for the wrong one.
export const STOPWORDS: Record<"it" | "en" | "de" | "es" | "fr" | "pt" | "nl" | "tr" | "id", string[]> = {
  it: ["della", "che", "sono", "nel", "delle", "degli", "gli", "anche", "esperienza", "nostro", "lavoro", "alla"],
  en: ["the", "and", "with", "you", "our", "for", "will", "are", "experience", "team", "your"],
  de: ["und", "der", "die", "mit", "für", "wir", "sie", "ist", "das", "erfahrung", "ihre", "eine"],
  es: ["el", "los", "las", "y", "experiencia", "equipo", "nuestro", "buscamos", "también", "conocimientos"],
  fr: ["le", "les", "des", "avec", "pour", "vous", "nous", "est", "dans", "expérience"],
  pt: ["os", "dos", "com", "uma", "você", "não", "experiência", "equipe", "também", "conhecimento"],
  nl: ["het", "een", "van", "voor", "wij", "ervaring", "zijn", "je", "jouw", "onze"],
  tr: ["ve", "bir", "için", "ile", "bu", "olarak", "deneyim", "olan", "iş"],
  id: ["yang", "untuk", "dengan", "kami", "anda", "pengalaman", "dalam", "akan", "kerja", "tim"],
}

/**
 * The posting's language. Scripts first, as a share of its letters (postings mix in English
 * tool names): Hangul is Korean, kana Japanese, Han without kana Chinese, Cyrillic Russian.
 * Otherwise its most frequent common words; English when unclear.
 */
export function postingLanguage(text: string | null): CvLanguage {
  const letters = (text ?? "").match(/\p{L}/gu) ?? []
  const share = (script: RegExp) => letters.filter((c) => script.test(c)).length / (letters.length || 1)
  if (share(/\p{Script=Hangul}/u) >= 0.3) return "ko"
  const kana = share(/[\p{Script=Hiragana}\p{Script=Katakana}]/u)
  const han = share(/\p{Script=Han}/u)
  if (kana >= 0.1 && kana + han >= 0.3) return "ja"
  if (han >= 0.3) return "zh"
  if (share(/\p{Script=Cyrillic}/u) >= 0.3) return "ru"
  const words = (text ?? "").toLowerCase().match(/\p{L}+/gu) ?? []
  const counts = Object.fromEntries(Object.keys(STOPWORDS).map((l) => [l, 0])) as Record<keyof typeof STOPWORDS, number>
  for (const w of words)
    for (const lang of Object.keys(STOPWORDS) as (keyof typeof STOPWORDS)[]) if (STOPWORDS[lang].includes(w)) counts[lang]++
  const best = (Object.entries(counts) as [keyof typeof STOPWORDS, number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : "en"
}

export interface ResolvedCv {
  language: CvLanguage
  format: "a4" | "letter"
  style: CvPrefs["style"]
  photo: boolean
  /** The line the CV ends with; "" for none. */
  footer: string
}

export function footerApplies(prefs: Pick<CvPrefs, "footer" | "footerCountries">, country: string | null): boolean {
  if (!prefs.footer.trim()) return false
  return prefs.footerCountries.length === 0 || (!!country && prefs.footerCountries.includes(country))
}

/** The preferences applied to one posting: no "auto" left. */
export function resolveCv(prefs: CvPrefs, job: Pick<Job, "location" | "description">, hasPhoto: boolean): ResolvedCv {
  const country = jobCountry(job.location)
  const language = prefs.language === "job" ? postingLanguage(job.description) : prefs.language
  return {
    language,
    format: prefs.format === "auto" ? (country && LETTER.has(country) ? "letter" : "a4") : prefs.format,
    style: prefs.style,
    photo: hasPhoto && (prefs.photo === "always" || (prefs.photo === "auto" && !(country && NO_PHOTO.has(country)))),
    // Everywhere, or only in the countries chosen (a posting that doesn't say where gets none).
    footer: footerApplies(prefs, country) ? prefs.footer.trim() : "",
  }
}
