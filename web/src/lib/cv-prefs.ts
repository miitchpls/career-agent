/** CV preferences (saved by the server) and what they mean for one posting. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type CvLanguage, type CvPrefs, type Job } from "@/lib/api"
import { msgs } from "@/lib/i18n"

export const DEFAULT_CV_PREFS: CvPrefs = { language: "job", format: "auto", style: "standard", photo: "auto" }

export function useCvPrefs(): CvPrefs {
  const { data } = useQuery({ queryKey: ["cv-prefs"], queryFn: api.cv.prefs, staleTime: Infinity })
  return data ?? DEFAULT_CV_PREFS
}

/** Changes apply at once; a failed save puts the previous value back. */
export function useSaveCvPrefs() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.cv.savePrefs,
    onMutate: (next) => {
      const before = client.getQueryData<CvPrefs>(["cv-prefs"])
      client.setQueryData(["cv-prefs"], next)
      return { before }
    },
    onError: (e, _next, ctx) => {
      client.setQueryData(["cv-prefs"], ctx?.before)
      toast.error(msgs().profile.saveFailed, { description: e.message })
    },
  })
}

// --- Resolving "auto" for a posting -------------------------------------------------------------

// Country names and codes as the boards write them at the end of a location.
const COUNTRIES: [string, RegExp][] = [
  ["us", /\b(united states|usa|us)$/],
  ["ca", /\b(canada|ca)$/],
  ["gb", /\b(united kingdom|uk|gb|england|scotland)$/],
  ["ie", /\b(ireland|ie)$/],
  ["ch", /\b(switzerland|schweiz|suisse|svizzera|ch)$/],
  ["de", /\b(germany|deutschland|germania|de)$/],
  ["at", /\b(austria|österreich|at)$/],
  ["it", /\b(italy|italia|it)$/],
  ["fr", /\b(france|francia|fr)$/],
  ["es", /\b(spain|españa|spagna|es)$/],
  ["nl", /\b(netherlands|nederland|paesi bassi|nl)$/],
  ["kr", /(\b(south korea|korea|republic of korea|kr)|대한민국|한국)$/],
]

/** ISO code of the posting's country, from the end of its location ("Zurich, ZH, Switzerland"). */
export function jobCountry(location: string | null): string | null {
  const text = (location ?? "").trim().toLowerCase().replace(/[.\s]+$/, "")
  return COUNTRIES.find(([, re]) => re.test(text))?.[0] ?? null
}

// Where the page is Letter, and where a CV without a photo is the norm (anti-discrimination
// practice). Elsewhere in Europe a photo is common.
const LETTER = new Set(["us", "ca"])
const NO_PHOTO = new Set(["us", "ca", "gb", "ie"])

const STOPWORDS: Record<Exclude<CvLanguage, "ko">, string[]> = {
  it: ["il", "della", "per", "che", "con", "sono", "nel", "delle", "una", "esperienza"],
  en: ["the", "and", "with", "you", "our", "for", "will", "are", "experience", "team"],
  de: ["und", "der", "die", "mit", "für", "wir", "sie", "ist", "das", "erfahrung"],
}

/**
 * The posting's language: Korean when most of its letters are Hangul (Korean postings mix in
 * English tool names, and attach particles to words, so stopwords don't work there); otherwise
 * by its most frequent common words; English when unclear.
 */
export function postingLanguage(text: string | null): CvLanguage {
  const letters = (text ?? "").match(/\p{L}/gu) ?? []
  const hangul = letters.filter((c) => /\p{Script=Hangul}/u.test(c)).length
  if (hangul && hangul >= letters.length * 0.3) return "ko"
  const words = (text ?? "").toLowerCase().match(/\p{L}+/gu) ?? []
  const counts = { it: 0, en: 0, de: 0 }
  for (const w of words)
    for (const lang of ["it", "en", "de"] as const) if (STOPWORDS[lang].includes(w)) counts[lang]++
  const best = (Object.entries(counts) as ["it" | "en" | "de", number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : "en"
}

export interface ResolvedCv {
  language: CvLanguage
  format: "a4" | "letter"
  style: CvPrefs["style"]
  photo: boolean
}

/** The preferences applied to one posting: no "auto" left. */
export function resolveCv(prefs: CvPrefs, job: Pick<Job, "location" | "description">, hasPhoto: boolean): ResolvedCv {
  const country = jobCountry(job.location)
  return {
    language: prefs.language === "job" ? postingLanguage(job.description) : prefs.language,
    format: prefs.format === "auto" ? (country && LETTER.has(country) ? "letter" : "a4") : prefs.format,
    style: prefs.style,
    photo: hasPhoto && (prefs.photo === "always" || (prefs.photo === "auto" && !(country && NO_PHOTO.has(country)))),
  }
}
