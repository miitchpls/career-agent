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
import { CV_HEADINGS, cvStore, tailoredFor, useGenerated, type MatchKind } from "@/lib/cv-mock"
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
  const cv = useMemo(() => (void locale, tailoredFor(job.title, job.company)), [job.title, job.company, locale])
  const prefs = useCvPrefs()
  const { profile } = useProfile()
  const look = resolveCv(prefs, job, !!profile.photo)
  const languageName = { it: all.profileView.languageIt, en: all.profileView.languageEn, de: all.profileView.languageDe }
  const [marks, setMarks] = useState(true)
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t.preview}</h3>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t.highlight}
            <Switch size="sm" checked={marks} onCheckedChange={setMarks} />
          </label>
        </div>
        <Paper cv={cv} marks={marks} look={look} />
      </section>
    </div>
  )
}

const STYLE = {
  modern: {
    page: "font-sans text-[10px] leading-relaxed px-[7%] py-[6%]",
    header: "border-b border-neutral-200 pb-3",
    name: "text-[18px] font-semibold tracking-tight",
    section: "mt-3",
    title: "mb-1 text-[8.5px] font-semibold tracking-[0.14em] text-neutral-500 uppercase",
    photo: "rounded-full",
  },
  classic: {
    page: "font-serif text-[10px] leading-relaxed px-[8%] py-[7%]",
    header: "pb-3 text-center",
    name: "text-[20px] font-normal tracking-wide",
    section: "mt-3.5",
    title: "mb-1.5 border-b border-neutral-300 pb-0.5 text-[10px] font-semibold text-neutral-800",
    photo: "rounded-[2px]",
  },
  compact: {
    page: "font-sans text-[9px] leading-snug px-[5.5%] py-[4.5%]",
    header: "border-b border-neutral-200 pb-2",
    name: "text-[15px] font-semibold tracking-tight",
    section: "mt-2",
    title: "mb-0.5 text-[8px] font-bold tracking-[0.1em] text-neutral-700 uppercase",
    photo: "rounded-md",
  },
} as const

/** The CV page as it will print: always white paper, whatever the app theme. */
function Paper({ cv, marks, look }: { cv: ReturnType<typeof tailoredFor>; marks: boolean; look: ResolvedCv }) {
  const t = useT().cv
  const { profile } = useProfile()
  const s = STYLE[look.style]
  const h = CV_HEADINGS[look.language]
  const mark = (on?: boolean) =>
    cn("rounded-[2px] transition-colors", on && marks && "bg-amber-200/70 box-decoration-clone px-0.5")
  const contacts = [profile.location, profile.email, ...profile.links.map((l) => l.label)].filter(Boolean)

  return (
    <div className="rounded-lg border bg-muted/40 p-4 sm:p-6">
      <motion.article
        key={`${look.style}-${look.format}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "mx-auto max-w-xl overflow-hidden rounded-sm bg-white text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_-8px_rgba(0,0,0,.18)]",
          // A4 is 210 × 297 mm, Letter 8.5 × 11 in.
          look.format === "a4" ? "aspect-[210/297]" : "aspect-[8.5/11]",
          s.page,
        )}
      >
        <header className={cn("flex items-center gap-4", look.style === "classic" && "flex-col gap-2", s.header)}>
          {look.photo && profile.photo && (
            <img src={profile.photo} alt="" className={cn("size-14 shrink-0 object-cover", s.photo)} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className={cn("text-neutral-950", s.name)}>{profile.name || t.yourName}</h1>
            <p className="text-[11px] text-neutral-600">{profile.headline || "Senior Backend Engineer · Python, event-driven systems"}</p>
            {contacts.length > 0 && <p className="mt-1 text-[9px] text-neutral-500">{contacts.join(" · ")}</p>}
          </div>
        </header>

        <CvSection title={h.profile} style={s}>
          <p className={mark(true)}>{cv.summary}</p>
        </CvSection>

        <CvSection title={h.experience} style={s}>
          <div className={look.style === "compact" ? "space-y-1.5" : "space-y-2.5"}>
            {cv.experiences.map((e) => (
              <div key={e.role}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-neutral-950">
                    {e.role} <span className="font-normal text-neutral-500">· {e.company}</span>
                  </p>
                  <p className="shrink-0 text-[9px] text-neutral-500 tabular-nums">{e.dates}</p>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {e.bullets.map((b) => (
                    <li key={b.text} className="flex gap-1.5">
                      <span className="text-neutral-400">–</span>
                      <span className={mark(b.changed)}>{b.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CvSection>

        <CvSection title={h.skills} style={s}>
          <p className={mark(true)}>{cv.skills.join(" · ")}</p>
        </CvSection>

        <CvSection title={h.education} style={s}>
          <p>
            <span className="font-semibold text-neutral-950">MSc Computer Engineering</span> · Politecnico di Torino ·
            2019
          </p>
        </CvSection>

        <CvSection title={h.languages} style={s}>
          <p>Italian (native) · English (C1) · German (A2)</p>
        </CvSection>
      </motion.article>
    </div>
  )
}

function CvSection({
  title,
  style,
  children,
}: {
  title: string
  style: (typeof STYLE)[keyof typeof STYLE]
  children: React.ReactNode
}) {
  return (
    <section className={style.section}>
      <h2 className={style.title}>{title}</h2>
      {children}
    </section>
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
