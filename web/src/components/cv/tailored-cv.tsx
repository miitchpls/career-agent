import { useEffect, useMemo, useState } from "react"
import {
  CheckIcon,
  CircleDashedIcon,
  DownloadIcon,
  FileUserIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Job } from "@/lib/api"
import { CvPage } from "@/components/cv/cv-page"
import { cvStore, tailoredFor, useGenerated, type MatchKind, type Tailored } from "@/lib/cv-mock"
import { useCvPreview } from "@/lib/cv-preview"
import { resolveCv, useCvPrefs, type ResolvedCv } from "@/lib/cv-prefs"
import { hasProfile, useProfile } from "@/lib/profile"
import { useLocale, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type CvPhase = "idle" | "generating" | "done"

/** "CV per questa offerta" tab of the job sheet. Mock: no request leaves the browser. */
export function TailoredCv({
  job,
  phase,
  onGenerate,
  onDone,
  onOpenProfile,
}: {
  job: Job
  phase: CvPhase
  onGenerate: () => void
  onDone: () => void
  onOpenProfile: () => void
}) {
  const state = useProfile()
  if (!hasProfile(state)) return <NoProfile onOpenProfile={onOpenProfile} />
  if (phase === "idle") return <Idle onGenerate={onGenerate} pending={state.stage === "review"} onOpenProfile={onOpenProfile} />
  if (phase === "generating") return <Generating job={job} onDone={onDone} />
  return <Result job={job} onRegenerate={onGenerate} onOpenProfile={onOpenProfile} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">{children}</div>
}

function NoProfile({ onOpenProfile }: { onOpenProfile: () => void }) {
  const t = useT().cv
  return (
    <Centered>
      <div className="grid size-10 place-items-center rounded-lg border bg-background shadow-xs">
        <FileUserIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t.needProfile}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t.needProfileHint}</p>
      </div>
      <Button size="sm" onClick={onOpenProfile}>
        {t.createProfile}
      </Button>
    </Centered>
  )
}

function Idle({
  onGenerate,
  pending,
  onOpenProfile,
}: {
  onGenerate: () => void
  pending: boolean
  onOpenProfile: () => void
}) {
  const t = useT().cv
  return (
    <Centered>
      <div className="grid size-10 place-items-center rounded-lg border bg-background shadow-xs">
        <SparklesIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t.forThisJob}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t.forThisJobHint}</p>
      </div>
      <Button size="sm" onClick={onGenerate}>
        <SparklesIcon />
        {t.generate}
      </Button>
      {pending && (
        <button type="button" onClick={onOpenProfile} className="text-xs text-amber-700 underline-offset-4 hover:underline dark:text-amber-300">
          {t.stillToReview}
        </button>
      )}
    </Centered>
  )
}

function Generating({ job, onDone }: { job: Job; onDone: () => void }) {
  const steps = useT().cv.steps
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= steps.length) {
      cvStore.markGenerated(job.url)
      const timer = setTimeout(onDone, 300)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setStep((s) => s + 1), 750)
    return () => clearTimeout(timer)
  }, [step, steps.length, job.url, onDone])

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-sm space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: i <= step ? 1 : 0.4, x: 0 }}
            className="flex items-center gap-3 text-sm"
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full border",
                i < step && "border-foreground bg-foreground text-background",
              )}
            >
              {i < step ? <CheckIcon className="size-3" /> : i === step ? <LoaderCircleIcon className="size-3 animate-spin" /> : null}
            </span>
            {s}
          </motion.div>
        ))}
      </div>
      {/* Paper placeholder, so the result doesn't jump in from nowhere. */}
      <div className="mx-auto mt-8 aspect-[1/1.414] max-w-md animate-pulse rounded-md border bg-muted/40" />
    </div>
  )
}

const KIND: Record<MatchKind, { icon: typeof CheckIcon; cls: string }> = {
  have: { icon: CheckIcon, cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" },
  partial: { icon: CircleDashedIcon, cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  gap: { icon: XIcon, cls: "border-dashed text-muted-foreground" },
}

function Result({ job, onRegenerate, onOpenProfile }: { job: Job; onRegenerate: () => void; onOpenProfile: () => void }) {
  const all = useT()
  const t = all.cv
  const locale = useLocale()
  // The analysis is phrased in the UI's language: redo it when that changes.
  const { profile } = useProfile()
  const cv = useMemo(() => (void locale, tailoredFor(profile, job)), [profile, job, locale])
  const prefs = useCvPrefs()
  const [marks, setMarks] = useState(true)
  const look = resolveCv(prefs, job, !!profile.photo)
  const languageName = {
    it: all.profileView.languageIt,
    en: all.profileView.languageEn,
    de: all.profileView.languageDe,
    ko: all.profileView.languageKo,
  }
  const gaps = cv.matches.filter((m) => m.kind === "gap")
  const have = cv.matches.filter((m) => m.kind === "have").length

  return (
    <div className="space-y-6 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-xs text-muted-foreground">
          {t.meta(cv.version, languageName[look.language], look.format === "a4" ? "A4" : "Letter", cv.generatedAt)}
        </div>
        <Button variant="ghost" size="sm" onClick={onRegenerate}>
          <RefreshCwIcon />
          {t.regenerate}
        </Button>
        <Button size="sm" onClick={() => toast(t.pdfSoon, { description: all.common.previewOnly })}>
          <DownloadIcon />
          {t.download}
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">{t.asks}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t.inProfile(have, cv.matches.length)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cv.matches.map((m) => {
            const k = KIND[m.kind]
            return (
              <Tooltip key={m.skill}>
                <TooltipTrigger asChild>
                  <span className={cn("inline-flex h-6 cursor-default items-center gap-1 rounded-full border px-2 text-xs", k.cls)}>
                    <k.icon className="size-3" />
                    {m.skill}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t[m.kind]}: {m.why}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        {gaps.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <p className="flex-1 text-xs text-pretty text-muted-foreground">
              <span className="font-medium text-foreground">{gaps.map((g) => g.skill).join(t.and)}</span>
              {t.gapsNote}
            </p>
            <Button variant="outline" size="xs" onClick={onOpenProfile}>
              {t.openProfile}
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t.changed}</h3>
        <ul className="space-y-1.5">
          {cv.changes.map((c) => (
            <li key={c} className="flex gap-2 text-sm">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              {c}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">
            {t.preview} <span className="font-normal text-muted-foreground">· {all.cv.templates[look.style].name}</span>
          </h3>
          {cv.marked.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t.highlight}
              <Switch size="sm" checked={marks} onCheckedChange={setMarks} />
            </label>
          )}
        </div>
        {!(profile.name || profile.experiences.length) && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{t.thinProfile}</p>
        )}
        <div className="rounded-lg border bg-muted/40 p-4 sm:p-6">
          <TailoredPage cv={cv} look={look} marks={marks} />
        </div>
      </section>
    </div>
  )
}

/** The tailored profile in the chosen template, moved texts highlighted. */
function TailoredPage({ cv, look, marks }: { cv: Tailored; look: ResolvedCv; marks: boolean }) {
  const preview = useCvPreview({
    templates: [look.style],
    language: look.language,
    format: look.format,
    photo: look.photo,
    profile: cv.profile,
    marked: marks ? cv.marked : [],
  })
  return (
    <CvPage
      html={preview.data?.pages[look.style]}
      format={look.format}
      className="mx-auto max-w-xl rounded-sm shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_-8px_rgba(0,0,0,.18)]"
    />
  )
}

/** Small "CV ✓" marker in the jobs table. */
export function CvMark({ url }: { url: string }) {
  const t = useT().cv
  const generated = useGenerated()
  return (
    <AnimatePresence>
      {generated.has(url) && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="ml-1.5 inline-flex h-4 items-center gap-0.5 rounded border px-1 align-middle text-[10px] font-medium text-muted-foreground"
          title={t.mark}
        >
          <FileUserIcon className="size-2.5" />
          CV
        </motion.span>
      )}
    </AnimatePresence>
  )
}
