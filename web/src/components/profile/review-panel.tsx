import { useEffect, useMemo, useState } from "react"
import { CheckIcon, LoaderCircleIcon, PlusIcon, RefreshCwIcon, SparklesIcon, XIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { ReviewSuggestion } from "@/lib/api"
import { intlTag, useT } from "@/lib/i18n"
import { profileChecks, type Check } from "@/lib/profile-checks"
import {
  applySuggestion,
  diffWords,
  fill,
  isStale,
  parts,
  useCancelReview,
  useReview,
  useSetSuggestion,
  useStartReview,
} from "@/lib/profile-review"
import { profileStore, useProfile, type Profile } from "@/lib/profile"
import { openPreferences } from "@/lib/preferences"
import { activeEngine, useAiEngines } from "@/lib/use-ai"
import { cn } from "@/lib/utils"

/** Enough written text for the AI to review (mirrors `review._reviewable`). */
const reviewable = (p: Profile) =>
  !!p.summary.trim() || p.experiences.some((e) => e.bullets.length) || p.projects.some((x) => x.description) || p.education.some((d) => d.description)

/** Scroll to an entry on the page and flash it, after the sheet has closed. */
function reveal(target: string) {
  window.setTimeout(() => {
    const el = document.getElementById(target)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.animate(
      [{ boxShadow: "0 0 0 2px color-mix(in oklab, var(--color-violet-500) 55%, transparent)" }, { boxShadow: "0 0 0 2px transparent" }],
      { duration: 1800, easing: "ease-out" },
    )
  }, 250)
}

/** Sidebar card: what the checks found, and the way into the review. */
export function ReviewCard() {
  const t = useT().review
  const { profile } = useProfile()
  const review = useReview()
  const [open, setOpen] = useState(false)
  const checks = useMemo(() => profileChecks(profile), [profile])
  const pending = (review.data?.suggestions ?? []).filter((s) => s.state === "open" && !isStale(profile, s)).length
  const running = review.data?.status === "running"

  return (
    <Card className="gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{t.card}</h2>
        {running && <LoaderCircleIcon className="size-3.5 animate-spin text-violet-500" />}
      </div>
      <p className="text-xs text-pretty text-muted-foreground">{t.cardText}</p>
      <p className="text-xs font-medium tabular-nums">{t.counts(checks.length, pending)}</p>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SparklesIcon className="text-violet-500" />
        {pending || running ? t.open : t.start}
      </Button>
      <ReviewSheet open={open} onOpenChange={setOpen} checks={checks} />
    </Card>
  )
}

function ReviewSheet({ open, onOpenChange, checks }: { open: boolean; onOpenChange: (o: boolean) => void; checks: Check[] }) {
  const t = useT().review
  const show = (target: string) => {
    onOpenChange(false)
    reveal(target)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-8 px-6 py-6">
          <AiSection />
          <ChecksSection checks={checks} onShow={show} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 space-y-0.5">
      <h3 className="text-sm font-medium">{title}</h3>
      {hint && <p className="text-xs text-pretty text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ChecksSection({ checks, onShow }: { checks: Check[]; onShow: (target: string) => void }) {
  const t = useT().review.checks
  return (
    <section>
      <SectionTitle title={t.title} hint={t.hint} />
      {checks.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckIcon className="size-4 text-emerald-500" />
          {t.none}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span className="min-w-0 flex-1 text-sm text-pretty">{c.message}</span>
              <Button variant="ghost" size="xs" className="-my-0.5 shrink-0" onClick={() => onShow(c.target)}>
                {t.show}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const s = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000))
  return <span className="font-mono tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>
}

function AiSection() {
  const all = useT()
  const t = all.review.ai
  const { profile, stage } = useProfile()
  const review = useReview()
  const start = useStartReview()
  const cancel = useCancelReview()
  const engines = useAiEngines()
  const engine = activeEngine(engines.data)
  const data = review.data
  const items = data?.suggestions ?? []
  const open = items.filter((s) => s.state === "open")
  const applied = items.filter((s) => s.state === "applied").length
  const dismissed = items.filter((s) => s.state === "dismissed").length
  const blocked = stage !== "ready" ? t.blockedDraft : !engine ? t.noEngine : !reviewable(profile) ? t.nothing : null

  const startButton = (label: string, variant: "default" | "outline" = "default") => (
    <Button size="sm" variant={variant} disabled={!!blocked || start.isPending} onClick={() => start.mutate()}>
      {start.isPending ? <LoaderCircleIcon className="animate-spin" /> : variant === "default" ? <SparklesIcon /> : <RefreshCwIcon />}
      {label}
    </Button>
  )
  const blockedNote = blocked && (
    <p className="text-xs text-muted-foreground">
      {blocked}
      {!engine && stage === "ready" && (
        <>
          {" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={openPreferences}>
            {all.onboarding.openPrefs}
          </button>
        </>
      )}
    </p>
  )

  return (
    <section>
      <SectionTitle title={t.title} />
      {data?.status === "running" ? (
        <div className="space-y-3 rounded-lg border border-violet-500/25 bg-violet-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LoaderCircleIcon className="size-4 animate-spin text-violet-500" />
            <span className="min-w-0 flex-1">{t.running(engine?.provider.name ?? data.provider)}</span>
            <Elapsed since={data.created_at} />
          </div>
          <p className="text-xs text-muted-foreground">{t.runningHint}</p>
          <div className="space-y-2">
            {[0.9, 0.7, 0.8].map((w, i) => (
              <div key={i} className="h-2 animate-pulse rounded-full bg-violet-500/10" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
          <Button variant="ghost" size="xs" className="-ml-2" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {t.cancel}
          </Button>
        </div>
      ) : !data ? (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-pretty text-muted-foreground">{t.intro}</p>
          {engine && <p className="text-xs text-muted-foreground">{t.engine(engine.provider.name, engine.model)}</p>}
          {startButton(t.start)}
          {blockedNote}
        </div>
      ) : data.status === "failed" ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">{t.failed}</p>
          {data.error && <p className="text-xs text-pretty text-muted-foreground">{data.error}</p>}
          {startButton(all.common.retry, "outline")}
          {blockedNote}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {open.map((s) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
              >
                <SuggestionCard s={s} profile={profile} disabled={stage !== "ready"} />
              </motion.div>
            ))}
          </AnimatePresence>
          {open.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckIcon className="size-4 text-emerald-500" />
              {items.length ? t.done : t.none}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-xs text-muted-foreground">
            <span>{t.reviewedAt(new Date(data.created_at).toLocaleString(intlTag(), { dateStyle: "medium", timeStyle: "short" }))}</span>
            {(applied > 0 || dismissed > 0) && <span className="tabular-nums">{t.tally(applied, dismissed)}</span>}
            <span className="ml-auto">{startButton(t.again, "outline")}</span>
          </div>
          {data.dropped > 0 && <p className="text-xs text-pretty text-muted-foreground">{t.dropped(data.dropped)}</p>}
          {blockedNote}
        </div>
      )}
    </section>
  )
}

/** Where a suggestion points: "Senior Data Engineer · Lumen, bullet 2". */
function useWhere(p: Profile, s: ReviewSuggestion): string {
  const w = useT().review.where
  if (s.section === "profile") return s.field === "summary" ? w.summary : w.headline
  const exp = s.section === "experience" ? p.experiences.find((e) => e.id === s.entryId) : undefined
  const name = exp
    ? [exp.role, exp.company].filter(Boolean).join(" · ")
    : s.section === "education"
      ? p.education.find((e) => e.id === s.entryId)?.school
      : s.section === "project"
        ? p.projects.find((x) => x.id === s.entryId)?.name
        : p.certifications.find((c) => c.id === s.entryId)?.name
  const part = s.field === "bullet" && s.index !== null ? w.bullet(s.index + 1) : s.field === "description" ? w.description : null
  return [name || "—", part].filter(Boolean).join(", ")
}

function SuggestionCard({ s, profile, disabled }: { s: ReviewSuggestion; profile: Profile; disabled: boolean }) {
  const t = useT().review
  const set = useSetSuggestion()
  const where = useWhere(profile, s)
  const stale = isStale(profile, s)
  const pieces = useMemo(() => parts(s.after), [s.after])
  const blankCount = pieces.filter((x) => "blank" in x).length
  const [answers, setAnswers] = useState<string[]>(() => Array(blankCount).fill(""))
  const filled = answers.every((a) => a.trim())
  const text = s.kind === "question" ? fill(s.after, answers) : s.after

  const apply = () => {
    profileStore.update(applySuggestion(profile, s, text))
    set.mutate({ id: s.id, state: "applied" })
    toast.success(t.applied)
  }

  return (
    <div className={cn("space-y-3 rounded-lg border bg-card p-3.5 shadow-xs", stale && "opacity-70")}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-transparent bg-violet-500/10 text-[11px] text-violet-700 dark:text-violet-300">
          {t.kinds[s.kind]}
        </Badge>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{where}</span>
      </div>
      {s.reason && <p className="text-sm text-pretty">{s.reason}</p>}

      {s.kind === "add_skill" ? (
        <span className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs whitespace-nowrap">
          <PlusIcon className="size-3" />
          {s.after}
        </span>
      ) : (
        <div className="overflow-hidden rounded-md border text-sm leading-relaxed">
          {s.before && <Before before={s.before} after={s.kind === "question" ? s.before : s.after} />}
          <div className="bg-emerald-500/[0.04] px-3 py-2">
            {s.kind === "question" ? (
              <p className="text-pretty">
                {pieces.map((x, i) =>
                  "text" in x ? (
                    <span key={i}>{x.text}</span>
                  ) : (
                    <input
                      key={i}
                      value={answers[x.index]}
                      onChange={(e) => setAnswers((a) => a.map((v, j) => (j === x.index ? e.target.value : v)))}
                      placeholder={x.blank}
                      aria-label={x.blank}
                      size={Math.max((answers[x.index] || x.blank).length, 3)}
                      className="mx-0.5 rounded-sm border-b border-dashed border-violet-500/60 bg-violet-500/10 px-1 text-sm outline-none placeholder:text-violet-700/60 focus:border-solid focus:bg-violet-500/15 dark:placeholder:text-violet-300/60"
                    />
                  ),
                )}
              </p>
            ) : (
              <After before={s.before} after={s.after} />
            )}
          </div>
        </div>
      )}

      {stale ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t.stale}</p>
      ) : s.kind === "question" && !filled ? (
        <p className="text-xs text-muted-foreground">{t.fillHint}</p>
      ) : null}
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="xs" disabled={set.isPending} onClick={() => set.mutate({ id: s.id, state: "dismissed" })}>
          <XIcon />
          {t.dismiss}
        </Button>
        <Button size="xs" disabled={disabled || stale || (s.kind === "question" && !filled)} onClick={apply}>
          <CheckIcon />
          {t.apply}
        </Button>
      </div>
    </div>
  )
}

/** The current text, with the words the suggestion drops struck through. */
function Before({ before, after }: { before: string; after: string }) {
  const diff = useMemo(() => diffWords(before, after), [before, after])
  return (
    <p className="border-b bg-muted/40 px-3 py-2 text-pretty text-muted-foreground">
      {diff
        .filter((d) => d.change !== "added")
        .map((d, i) =>
          d.change === "removed" ? (
            <del key={i} className="rounded-[3px] bg-rose-500/10 decoration-rose-500/60">
              {d.text}
            </del>
          ) : (
            <span key={i}>{d.text}</span>
          ),
        )}
    </p>
  )
}

/** The proposed text, with the words it adds highlighted. */
function After({ before, after }: { before: string; after: string }) {
  const diff = useMemo(() => (before ? diffWords(before, after) : [{ text: after, change: "same" as const }]), [before, after])
  return (
    <p className="text-pretty">
      {diff
        .filter((d) => d.change !== "removed")
        .map((d, i) =>
          d.change === "added" ? (
            <ins key={i} className="rounded-[3px] bg-emerald-500/15 no-underline">
              {d.text}
            </ins>
          ) : (
            <span key={i}>{d.text}</span>
          ),
        )}
    </p>
  )
}
