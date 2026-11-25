import { useEffect, useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  DownloadIcon,
  FilePenLineIcon,
  FileUserIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { CvPage } from "@/components/cv/cv-page"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CV_TEMPLATES, type CvPrefs, type CvTemplate, type Job, type TailoredCv as Cv, type TailoredCvResult } from "@/lib/api"
import { useCvPreview } from "@/lib/cv-preview"
import { type ResolvedCv } from "@/lib/cv-prefs"
import { CvSettings } from "@/components/cv/cv-settings"
import { intlTag, languageName, useT } from "@/lib/i18n"
import { shownScore, useScore } from "@/lib/job-score"
import { openPreferences } from "@/lib/preferences"
import { hasProfile, useProfile } from "@/lib/profile"
import {
  overrideCount,
  shownCv,
  useCancelCv,
  useCvLook,
  useCvSettings,
  useDownloadCv,
  useSaveCvSettings,
  useStartCv,
  useTailoredCv,
} from "@/lib/tailored-cv"
import { useCvPrefs } from "@/lib/cv-prefs"
import { activeEngine, useAiEngines } from "@/lib/use-ai"
import { cn } from "@/lib/utils"

/** The posting sheet's "CV" tab: write a CV for this posting, watch it run, read and download it. */
export function TailoredCv({ job, onOpenProfile }: { job: Job; onOpenProfile: () => void }) {
  const all = useT()
  const t = all.cv
  const state = useTailoredCv(job.url)
  const start = useStartCv(job.url)
  const cancel = useCancelCv(job.url)
  const profile = useProfile()
  const engine = activeEngine(useAiEngines().data)
  // The defaults with this posting's own settings: what it's written and printed with.
  const { look, prefs } = useCvLook(job)

  const latest = state.data?.cv ?? null
  const shown = shownCv(state.data)
  const running = latest?.status === "running"
  const generate = () => start.mutate(look.language)

  if (!hasProfile(profile)) return <NoProfile onOpenProfile={onOpenProfile} />
  if (state.isPending)
    return (
      <div className="space-y-3 px-6 py-8">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mx-auto aspect-[1/1.414] max-w-md" />
      </div>
    )

  const blocked = !engine
    ? { text: t.noEngine, action: <LinkButton onClick={openPreferences}>{all.onboarding.openPrefs}</LinkButton> }
    : !job.description?.trim()
      ? { text: t.noText, action: null }
      : null
  const blockedNote = blocked && (
    <p className="text-xs text-pretty text-muted-foreground">
      {blocked.text} {blocked.action}
    </p>
  )

  return (
    <div>
      {running && <Running cv={latest} engine={engine?.provider.name} hasEarlier={!!shown} onCancel={() => cancel.mutate()} cancelling={cancel.isPending} />}

      {latest?.status === "failed" && (
        <div className="px-6 pt-6">
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{t.failed}</p>
            {latest.error && <p className="text-xs text-pretty text-muted-foreground">{latest.error}</p>}
            <Button size="sm" variant="outline" disabled={!!blocked || start.isPending} onClick={generate}>
              <RefreshCwIcon />
              {all.common.retry}
            </Button>
            {blockedNote}
          </div>
        </div>
      )}

      {!shown && !running && latest?.status !== "failed" && (
        <Idle
          job={job}
          look={look}
          blocked={!!blocked}
          blockedNote={blockedNote}
          starting={start.isPending}
          pending={profile.stage === "review"}
          onGenerate={generate}
          onOpenProfile={onOpenProfile}
        />
      )}

      {shown?.result && (
        <Result
          cv={shown}
          result={shown.result}
          job={job}
          look={look}
          prefs={prefs}
          busy={running || start.isPending || !!blocked}
          onRegenerate={generate}
          onOpenProfile={onOpenProfile}
        />
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">{children}</div>
}

function Glyph({ icon: Icon }: { icon: typeof FileUserIcon }) {
  return (
    <div className="grid size-10 place-items-center rounded-lg border bg-background shadow-xs">
      <Icon className="size-4 text-muted-foreground" />
    </div>
  )
}

function NoProfile({ onOpenProfile }: { onOpenProfile: () => void }) {
  const t = useT().cv
  return (
    <Centered>
      <Glyph icon={FileUserIcon} />
      <div className="space-y-1">
        <p className="text-sm font-medium">{t.needProfile}</p>
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">{t.needProfileHint}</p>
      </div>
      <Button size="sm" onClick={onOpenProfile}>
        {t.createProfile}
      </Button>
    </Centered>
  )
}


function Idle({
  job,
  look,
  blocked,
  blockedNote,
  starting,
  pending,
  onGenerate,
  onOpenProfile,
}: {
  job: Job
  look: ResolvedCv
  blocked: boolean
  blockedNote: React.ReactNode
  starting: boolean
  pending: boolean
  onGenerate: () => void
  onOpenProfile: () => void
}) {
  const all = useT()
  const t = all.cv
  // career-ops tailors from its evaluation: a finished score aims the CV at what it found.
  const scored = !!shownScore(useScore(job.url).data)
  return (
    <Centered>
      <Glyph icon={FilePenLineIcon} />
      <div className="space-y-1">
        <p className="text-sm font-medium">{t.forThisJob}</p>
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">{t.forThisJobHint}</p>
      </div>
      <Button size="sm" disabled={blocked || starting} onClick={onGenerate}>
        {starting ? <LoaderCircleIcon className="animate-spin" /> : <FilePenLineIcon />}
        {t.generate}
      </Button>
      <p className="text-xs text-muted-foreground">
        {t.willWrite(languageName(look.language), look.format === "a4" ? "A4" : "Letter", all.cv.templates[look.style].name)}{" "}
        <CvSettings
          job={job}
          onOpenDefaults={onOpenProfile}
          trigger={
<LinkButton>{t.settings.customize}</LinkButton>
          }
        />
      </p>
      {blockedNote}
      {!scored && !blocked && <p className="max-w-sm text-xs text-pretty text-muted-foreground">{t.scoreFirst}</p>}
      {pending && (
        <button type="button" onClick={onOpenProfile} className="text-xs text-amber-700 underline-offset-4 hover:underline dark:text-amber-300">
          {t.stillToReview}
        </button>
      )}
    </Centered>
  )
}

/** Seconds since `iso`, ticking. */
function useElapsed(iso: string | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)) : 0
}

function Running({
  cv,
  engine,
  hasEarlier,
  onCancel,
  cancelling,
}: {
  cv: Cv | null
  engine: string | undefined
  hasEarlier: boolean
  onCancel: () => void
  cancelling: boolean
}) {
  const t = useT().cv
  const s = useElapsed(cv?.created_at)
  return (
    <div className="space-y-1 border-b px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-shimmer text-sm font-medium">{t.running(engine ?? "AI")}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
        </span>
        <Button variant="ghost" size="xs" className="-mr-2" disabled={cancelling} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.runningHint}</p>
      {!hasEarlier && (
        <div className="pt-6">
          <div className="mx-auto aspect-[1/1.414] max-w-md animate-pulse rounded-md border bg-muted/40" />
        </div>
      )}
    </div>
  )
}

const KIND = {
  listed: { icon: CheckIcon, cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" },
  supported: { icon: CircleDashedIcon, cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  gap: { icon: XIcon, cls: "border-dashed text-muted-foreground" },
} as const

function Result({
  cv,
  result: r,
  job,
  look,
  prefs,
  busy,
  onRegenerate,
  onOpenProfile,
}: {
  cv: Cv
  result: TailoredCvResult
  job: Job
  look: ResolvedCv
  prefs: CvPrefs
  busy: boolean
  onRegenerate: () => void
  onOpenProfile: () => void
}) {
  const all = useT()
  const t = all.cv
  const download = useDownloadCv()
  const [marks, setMarks] = useState(true)
  const when = new Date(cv.created_at).toLocaleString(intlTag(), { dateStyle: "medium", timeStyle: "short" })
  const gaps = r.keywords.filter((k) => k.kind === "gap")
  const inCv = r.keywords.filter((k) => k.inCv).length
  const otherLanguage = look.language !== cv.language

  return (
    <div>
      {(cv.stale || otherLanguage) && (
        <div className="flex items-center gap-3 border-b bg-muted/50 px-6 py-2.5">
          <p className="flex-1 text-xs text-pretty text-muted-foreground">
            {otherLanguage ? t.otherLanguage(languageName(cv.language), languageName(look.language)) : t.stale}
          </p>
          <Button variant="outline" size="xs" disabled={busy} onClick={onRegenerate}>
            <RefreshCwIcon />
            {t.regenerate}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-6 pt-5 pb-4">
        <p className="mr-auto text-xs text-muted-foreground tabular-nums">
          {t.meta(cv.version, languageName(cv.language), look.format === "a4" ? "A4" : "Letter", when)}
        </p>
        {/* The banner above already offers it. */}
        {!(cv.stale || otherLanguage) && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onRegenerate}>
            <RefreshCwIcon />
            {t.regenerate}
          </Button>
        )}
        <CvSettings job={job} onOpenDefaults={onOpenProfile} trigger={<SettingsButton url={job.url} />} />
        <Button
          size="sm"
          disabled={download.isPending}
          onClick={() =>
            download.mutate({ url: job.url, template: look.style, format: look.format, photo: look.photo, footer: look.footer })
          }
        >
          {download.isPending ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
          {t.download}
        </Button>
      </div>

      {r.keywords.length > 0 && (
        <Section title={t.keywords} hint={r.coverage !== null ? t.coverage(inCv, r.keywords.length) : undefined}>
          {r.coverage !== null && (
            <div className="mb-3 flex items-center gap-3">
              <Progress value={r.coverage} className="h-1.5 flex-1" aria-label={t.keywords} />
              <span className="font-mono text-xs font-medium tabular-nums">{r.coverage}%</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {r.keywords.map((k) => {
              const kind = KIND[k.kind]
              return (
                <Tooltip key={k.term}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex h-6 cursor-default items-center gap-1 rounded-full border px-2 text-xs",
                        kind.cls,
                        !k.inCv && k.kind !== "gap" && "opacity-60",
                      )}
                    >
                      <kind.icon className="size-3" />
                      {k.term}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    {t.kinds[k.kind]} · {k.inCv ? t.inCv : t.notInCv}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
          {gaps.length > 0 && (
            <div className="mt-3 flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
              <p className="flex-1 text-xs text-pretty text-muted-foreground">
                <span className="font-medium text-foreground">{gaps.map((g) => g.term).join(", ")}</span>
                {t.gapsNote}
              </p>
              <Button variant="outline" size="xs" onClick={onOpenProfile}>
                {t.openProfile}
              </Button>
            </div>
          )}
        </Section>
      )}

      {r.changes.length > 0 && (
        <Section title={t.changed}>
          <ul className="space-y-1.5">
            {r.changes.map((c) => (
              <li key={c} className="flex gap-2 text-sm text-pretty">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                {c}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Checks warnings={r.warnings} />

      <Section
        title={t.preview}
        action={
          <div className="flex items-center gap-3">
            {r.marked.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t.highlight}
                <Switch size="sm" checked={marks} onCheckedChange={setMarks} />
              </label>
            )}
            <TemplatePicker url={job.url} value={look.style} />
          </div>
        }
      >
        <div className="rounded-lg border bg-muted/40 p-4 sm:p-6">
          <TailoredPage result={r} look={look} photoStyle={prefs.photoStyle} marks={marks} />
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-t px-6 py-5">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <h4 className="text-[13px] font-semibold">{title}</h4>
        {hint && <span className="text-xs text-muted-foreground tabular-nums">{hint}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

/** What the server's checks undid, folded: the CV is right as it is, this says why. */
function Checks({ warnings }: { warnings: TailoredCvResult["warnings"] }) {
  const t = useT().cv
  const [open, setOpen] = useState(false)
  if (!warnings.length) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className="border-t px-6 py-4">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
          <ShieldCheckIcon className="size-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold">{t.checks}</span>
          <span className="text-xs text-muted-foreground">{t.checksCount(warnings.length)}</span>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="mt-2 text-xs text-pretty text-muted-foreground">{t.checksHint}</p>
          <ul className="mt-3 space-y-3">
            {warnings.map((w, i) => (
              <li key={i} className="space-y-1 text-sm">
                <p className="text-pretty">
                  {t.warnings[w.kind]}
                  {w.terms.length > 0 && (
                    <>
                      {" "}
                      {w.terms.map((term) => (
                        <code key={term} className="mx-0.5 rounded bg-muted px-1 py-px font-mono text-[11px]">
                          {term}
                        </code>
                      ))}
                    </>
                  )}
                </p>
                <p className="border-l-2 pl-2.5 text-xs text-pretty text-muted-foreground line-through decoration-muted-foreground/40">
                  {w.text}
                </p>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** The template the CV is shown and downloaded in, for this posting only. */
function TemplatePicker({ url, value }: { url: string; value: CvTemplate }) {
  const all = useT()
  const defaults = useCvPrefs()
  const overrides = useCvSettings(url)
  const save = useSaveCvSettings(url)
  return (
    <Select
      value={value}
      onValueChange={(style) => save.mutate({ ...overrides, style: style === defaults.style ? null : (style as CvTemplate) })}
    >
      <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label={all.profileView.style}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {CV_TEMPLATES.map((id) => (
          <SelectItem key={id} value={id} className="text-xs">
            {all.cv.templates[id].name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** "Settings", with how many of them this posting changes. */
function SettingsButton({ url, ...props }: { url: string } & React.ComponentProps<typeof Button>) {
  const t = useT().cv.settings
  const n = overrideCount(useCvSettings(url))
  return (
    <Button variant="outline" size="sm" {...props}>
      <Settings2Icon />
      {t.trigger}
      {n > 0 && (
        <span className="-mr-1 rounded-full bg-foreground px-1.5 text-[10px] font-medium text-background tabular-nums" aria-label={t.changed(n)}>
          {n}
        </span>
      )}
    </Button>
  )
}

/** The tailored CV in the chosen template, rewritten and moved texts highlighted. */
function TailoredPage({
  result,
  look,
  photoStyle,
  marks,
}: {
  result: TailoredCvResult
  look: ResolvedCv
  photoStyle: CvPrefs["photoStyle"]
  marks: boolean
}) {
  const preview = useCvPreview({
    templates: [look.style],
    language: result.language,
    format: look.format,
    photo: look.photo,
    profile: result.profile,
    marked: marks ? result.marked : [],
    competencies: result.competencies,
    footer: look.footer,
    photoStyle,
  })
  return (
    <CvPage
      html={preview.data?.pages[look.style]}
      format={look.format}
      className="mx-auto max-w-xl rounded-sm shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_-8px_rgba(0,0,0,.18)]"
    />
  )
}

/** Small "CV" marker in the jobs table, for postings with a finished CV. */
export function CvMark({ shown }: { shown: boolean }) {
  const t = useT().cv
  return (
    <AnimatePresence>
      {shown && (
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
