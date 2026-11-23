/**
 * The AI review of the profile (`career_agent.review`): suggestions the user applies or ignores.
 * Applying is an ordinary profile edit, saved through the profile store; the server only learns
 * that the suggestion is done.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type ProfileReview, type ReviewState, type ReviewSuggestion } from "@/lib/api"
import { msgs } from "@/lib/i18n"
import { withSkills, type Profile } from "@/lib/profile"

// --- Blanks ------------------------------------------------------------------------------------

const BLANK = /\[\[([^[\]]{1,40})\]\]/g

/** The labels of a question's blanks: "riducendo i tempi del [[percentuale]]" → ["percentuale"]. */
export const blanks = (text: string): string[] => [...text.matchAll(BLANK)].map((m) => m[1])

/** The text with its blanks filled in, in order. */
export function fill(text: string, answers: string[]): string {
  let i = 0
  return text.replace(BLANK, () => (answers[i++] ?? "").trim())
}

/** The text split into literal parts and blanks, for inline inputs. */
export function parts(text: string): ({ text: string } | { blank: string; index: number })[] {
  const out: ({ text: string } | { blank: string; index: number })[] = []
  let last = 0
  let index = 0
  for (const m of text.matchAll(BLANK)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ blank: m[1], index: index++ })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

// --- Targets -----------------------------------------------------------------------------------

type Entry = { id: string; skills: string[]; bullets?: string[]; description?: string }

function entries(p: Profile, section: ReviewSuggestion["section"]): Entry[] {
  if (section === "experience") return p.experiences
  if (section === "education") return p.education
  if (section === "project") return p.projects
  if (section === "certification") return p.certifications
  return []
}

const entry = (p: Profile, s: ReviewSuggestion) => entries(p, s.section).find((e) => e.id === s.entryId)

/** The text the suggestion points at now; null when its entry or bullet is gone. */
export function currentText(p: Profile, s: ReviewSuggestion): string | null {
  if (s.section === "profile") return s.field === "summary" ? p.summary : s.field === "headline" ? p.headline : null
  const e = entry(p, s)
  if (!e) return null
  if (s.field === "bullet") return s.index !== null && e.bullets && s.index < e.bullets.length ? e.bullets[s.index] : null
  if (s.field === "description") return e.description ?? null
  if (s.field === "skill") return ""
  return null
}

/** The profile moved on since the review: the text was edited, or the skill already added. */
export function isStale(p: Profile, s: ReviewSuggestion): boolean {
  const now = currentText(p, s)
  if (now === null) return true
  if (s.kind === "add_skill") return !!entry(p, s)?.skills.some((x) => x.toLowerCase() === s.after.toLowerCase())
  return now.trim() !== s.before.trim()
}

function patched<T extends Entry>(x: T, s: ReviewSuggestion, text: string): T {
  if (s.kind === "add_skill") return { ...x, skills: [...x.skills, text] }
  if (s.field === "bullet") return { ...x, bullets: x.bullets?.map((b, i) => (i === s.index ? text : b)) }
  return { ...x, description: text }
}

/** The profile with the suggestion applied; `text` is the final text (blanks filled in). */
export function applySuggestion(p: Profile, s: ReviewSuggestion, text = s.after): Profile {
  if (s.section === "profile") return s.field === "summary" ? { ...p, summary: text } : { ...p, headline: text }
  const edit = <T extends Entry>(list: T[]) => list.map((x) => (x.id === s.entryId ? patched(x, s, text) : x))
  const next: Profile =
    s.section === "experience"
      ? { ...p, experiences: edit(p.experiences) }
      : s.section === "education"
        ? { ...p, education: edit(p.education) }
        : s.section === "project"
          ? { ...p, projects: edit(p.projects) }
          : { ...p, certifications: edit(p.certifications) }
  return s.kind === "add_skill" ? withSkills(next, [text]) : next
}

// --- Word diff ---------------------------------------------------------------------------------

export type DiffPart = { text: string; change: "same" | "added" | "removed" }

/** Word-level difference (longest common subsequence), to show what a rewrite changes. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean)
  const b = after.split(/(\s+)/).filter(Boolean)
  if (a.length * b.length > 40_000) return [{ text: before, change: "removed" }, { text: after, change: "added" }]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffPart[] = []
  const push = (text: string, change: DiffPart["change"]) => {
    const last = out.at(-1)
    if (last && last.change === change) last.text += text
    else out.push({ text, change })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) push(a[i++], (j++, "same"))
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push(a[i++], "removed")
    else push(b[j++], "added")
  }
  while (i < a.length) push(a[i++], "removed")
  while (j < b.length) push(b[j++], "added")
  return out
}

// --- Server state ------------------------------------------------------------------------------

const KEY = ["profile-review"]

/** The review whose suggestions are on screen: the latest if it finished, else the last that did. */
export const shownReview = (state: ReviewState | undefined): ProfileReview | null =>
  state?.review?.status === "ready" ? state.review : (state?.earlier ?? null)

/** The latest review (and the last finished one); polled while one runs. */
export function useReview() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.profile.review,
    refetchInterval: (q) => (q.state.data?.review?.status === "running" ? 1500 : false),
  })
}

function useReviewMutation<A>(fn: (arg: A) => Promise<ReviewState>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => client.setQueryData(KEY, state),
    onError: (e) => toast.error(e.message),
  })
}

export const useStartReview = () => useReviewMutation(() => api.profile.startReview())
export const useCancelReview = () => useReviewMutation(() => api.profile.cancelReview())

/** Mark a suggestion done at once; put it back if the server refuses. */
export function useSetSuggestion() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: ReviewSuggestion["state"] }) => api.profile.setSuggestion(id, state),
    onMutate: ({ id, state }) => {
      const before = client.getQueryData<ReviewState>(KEY)
      const mark = (r: ProfileReview | null) =>
        r && { ...r, suggestions: r.suggestions.map((s) => (s.id === id ? { ...s, state } : s)) }
      if (before) client.setQueryData(KEY, { review: mark(before.review), earlier: mark(before.earlier) })
      return { before }
    },
    onError: (e, _v, ctx) => {
      client.setQueryData(KEY, ctx?.before)
      toast.error(msgs().review.saveFailed, { description: e.message })
    },
    onSuccess: (state) => client.setQueryData(KEY, state),
  })
}
