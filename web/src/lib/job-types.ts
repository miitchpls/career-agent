import type { JobType } from "@/lib/api"

/** Employment types, in the order shown. `words` are what users may type to add one. */
export const JOB_TYPES: { value: JobType; label: string; words: string[] }[] = [
  { value: "fulltime", label: "Full time", words: ["full time", "full-time", "fulltime", "tempo pieno"] },
  { value: "parttime", label: "Part time", words: ["part time", "part-time", "parttime", "tempo parziale"] },
  {
    value: "contract",
    label: "Contratto",
    words: ["contratto", "a progetto", "freelance", "tempo determinato", "temporaneo", "contract"],
  },
  { value: "internship", label: "Tirocinio", words: ["tirocinio", "stage", "stagista", "internship", "praticantato"] },
  { value: "volunteer", label: "Volontariato", words: ["volontariato", "volontario", "volunteer"] },
]

export const JOB_TYPE_LABEL = Object.fromEntries(JOB_TYPES.map((t) => [t.value, t.label])) as Record<JobType, string>

/** ",fulltime,contract," (as stored) -> ["fulltime", "contract"] */
export function parseStoredJobTypes(stored: string | null): JobType[] {
  return (stored ?? "").split(",").filter((t): t is JobType => t in JOB_TYPE_LABEL)
}
