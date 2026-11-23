import type { JobType } from "@/lib/api"

/**
 * Employment types, in the order shown (labels: `t.jobTypes`). `words` are what users may
 * type to add one, in any of the UI languages.
 */
export const JOB_TYPES: { value: JobType; words: string[] }[] = [
  { value: "fulltime", words: ["full time", "full-time", "fulltime", "tempo pieno", "vollzeit", "정규직", "풀타임"] },
  { value: "parttime", words: ["part time", "part-time", "parttime", "tempo parziale", "teilzeit", "파트타임", "시간제", "아르바이트"] },
  {
    value: "contract",
    words: ["contratto", "a progetto", "freelance", "tempo determinato", "temporaneo", "contract", "befristet", "vertrag", "계약직", "프리랜서"],
  },
  { value: "internship", words: ["tirocinio", "stage", "stagista", "internship", "praticantato", "praktikum", "trainee", "인턴", "인턴십"] },
  { value: "volunteer", words: ["volontariato", "volontario", "volunteer", "ehrenamt", "freiwillig", "자원봉사"] },
]

const JOB_TYPE_VALUES = new Set<string>(JOB_TYPES.map((t) => t.value))

/** ",fulltime,contract," (as stored) -> ["fulltime", "contract"] */
export function parseStoredJobTypes(stored: string | null): JobType[] {
  return (stored ?? "").split(",").filter((t): t is JobType => JOB_TYPE_VALUES.has(t))
}
