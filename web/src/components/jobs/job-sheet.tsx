import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Markdown from "react-markdown"
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  Building2Icon,
  CircleHelpIcon,
  ClipboardPasteIcon,
  EyeOffIcon,
  FilePenLineIcon,
  FileUserIcon,
  GaugeIcon,
  LoaderCircleIcon,
  MapPinIcon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"

import { TailoredCv } from "@/components/cv/tailored-cv"

import { ApplyControl, ApplyNudge } from "@/components/jobs/apply-control"
import { PastePosting } from "@/components/jobs/paste-posting"
import { ScorePanel } from "@/components/jobs/score-panel"
import { SiteMark, WorkModeBadge } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type Job, type PastedPosting, type Query } from "@/lib/api"
import type { LinkSite } from "@/lib/job-link"
import type { JobTab } from "@/lib/routes"
import { convertedLabel, fullDate, relativeDay, salaryLabel } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { formatScore, shownScore, useCanScore, useScore, useStartScore } from "@/lib/job-score"
import { describe, type MatchLine } from "@/lib/search-match"
import { cn } from "@/lib/utils"
import { parseStoredJobTypes } from "@/lib/job-types"
import { shownCv, useCanTailor, useCvLook, useStartCv, useTailoredCv } from "@/lib/tailored-cv"


const MATCH_ICON = {
  unknown: { icon: CircleHelpIcon, className: "text-muted-foreground" },
  no: { icon: XIcon, className: "text-red-600 dark:text-red-400" },
}

/** The current search's conditions, met or not by this posting (no AI: the same rules as the filters). */
function SearchMatch({ url, query, listed }: { url: string; query: Query; listed: boolean }) {
  const t = useT().match
  // Only what the check reads (the "unknown" choices decide what excludes): editing the title
  // words or the free text doesn't refetch.
  const { scopes, salary_min, salary_currency, salary_unknown, job_types, job_type_unknown, posted_within } = query
  const { data } = useQuery({
    queryKey: [
      "job-match",
      url,
      JSON.stringify([scopes, salary_min, salary_currency, salary_unknown, job_types, job_type_unknown, posted_within]),
    ],
    queryFn: () => api.match(url, query),
    staleTime: 30_000,
  })
  const checks = data?.checks ?? []
  const said = (keep: boolean) =>
    checks.filter((c) => !!c.excludes === keep).map(describe).filter((l): l is MatchLine => l !== null)
  // What keeps it out of the results leads, as a warning; the rest stays quiet chips.
  const off = said(true)
  const lines = said(false)
  return (
    <>
      {off.length > 0 && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-medium text-foreground">{t.offTitle}</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {off.map((l) => (
                <li key={l.text} className="flex items-center gap-1.5">
                  {(() => {
                    const m = MATCH_ICON[l.state]
                    return <m.icon className={cn("size-3.5 shrink-0", m.className)} />
                  })()}
                  {l.text}
                </li>
              ))}
            </ul>
            {listed && <p className="pt-0.5 text-xs text-muted-foreground">{t.offListed}</p>}
          </div>
        </div>
      )}
      {lines.length > 0 && <MatchChips lines={lines} />}
    </>
  )
}

function MatchChips({ lines }: { lines: MatchLine[] }) {
  const t = useT().match
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="mr-0.5 cursor-default text-muted-foreground">{t.title}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{t.hint}</TooltipContent>
      </Tooltip>
      {lines.map((l) => {
        const m = MATCH_ICON[l.state]
        return (
          <span key={l.text} className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5">
            <m.icon className={cn("size-3.5", m.className)} />
            {l.text}
          </span>
        )
      })}
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  )
}

/** A posting being opened from a link: the sheet shows at once, filled when it arrives. */
export interface PendingJob {
  url: string
  site: LinkSite
  error: string | null
}

/**
 * Job details in a wide side panel: the list stays visible beside it, so moving
 * from one posting to the next keeps context (a modal would hide it).
 */
export function JobSheet({
  job,
  pending = null,
  query = null,
  listed = false,
  dismissed = false,
  tab,
  onTab,
  onClose,
  onDismiss,
  onRestore,
  onPaste,
  onOpenProfile,
  onOpenApplication,
}: {
  /** The tab shown, from the address: each one has its own, so back and forward return to it. */
  tab: JobTab
  onTab: (tab: JobTab) => void
  /** Opens a tracked posting's application, on the Applications page. */
  onOpenApplication: (id: number) => void
  job: Job | null
  pending?: PendingJob | null
  /** The search the sheet was opened from, to check the posting against; null: none. */
  query?: Query | null
  /** It's in the search's list with the "outside filters" mark (`Job.unmet`). */
  listed?: boolean
  /** The user hid it from the results. */
  dismissed?: boolean
  onClose: () => void
  /** "Not interested": hide it from the results (the sheet closes). */
  onDismiss: (job: Job) => void
  /** Show a hidden posting in the results again. */
  onRestore: (job: Job) => void
  /** Saves the text the user copied for a posting the board wouldn't show, or showed without text. */
  onPaste: (url: string, posting: PastedPosting) => Promise<void>
  onOpenProfile: () => void
}) {
  return (
    <Sheet open={!!job || !!pending} onOpenChange={(o) => !o && onClose()}>
      {/* The base sheet caps right panels at sm:max-w-sm via data-[side=right]:…;
          override with the same variant, or the higher-specificity cap wins. */}
      <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl">
        {/* Keyed by posting: tab and CV state start over for each one. */}
        {job ? (
          <JobDetails
            key={job.url}
            job={job}
            query={query}
            listed={listed}
            dismissed={dismissed}
            tab={tab}
            onTab={onTab}
            onDismiss={onDismiss}
            onRestore={onRestore}
            onOpenProfile={onOpenProfile}
            onPaste={onPaste}
            onOpenApplication={onOpenApplication}
          />
        ) : (
          pending && <PendingDetails key={pending.url} pending={pending} onClose={onClose} onPaste={onPaste} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function JobDetails({
  job,
  query,
  listed,
  dismissed,
  tab,
  onTab: setTab,
  onDismiss,
  onRestore,
  onOpenProfile,
  onPaste,
  onOpenApplication,
}: {
  onOpenApplication: (id: number) => void
  job: Job
  query: Query | null
  listed: boolean
  dismissed: boolean
  onDismiss: (job: Job) => void
  onRestore: (job: Job) => void
  tab: JobTab
  onTab: (tab: JobTab) => void
  onOpenProfile: () => void
  onPaste: (url: string, posting: PastedPosting) => Promise<void>
}) {
  const t = useT().jobs
  const { look } = useCvLook(job)
  const cvState = useTailoredCv(job.url).data
  const cv = shownCv(cvState)
  const writing = cvState?.cv?.status === "running"
  const startCv = useStartCv(job.url)
  const canTailor = useCanTailor(job)
  const scoreState = useScore(job.url).data
  const fit = shownScore(scoreState)
  const scoring = scoreState?.score?.status === "running"
  const startScore = useStartScore(job.url)
  const canScore = useCanScore(job)
  // Score first, then the CV if it's worth it: the header offers the next step, not both.
  const scoreFirst = !fit
  const score = () => {
    setTab("fit")
    // What's missing (profile, engine, text) the tab says.
    if (canScore && !scoring && !startScore.isPending) startScore.mutate()
  }
  const generate = () => {
    setTab("cv")
    // What's missing (profile, engine, text) the tab says.
    if (canTailor && !writing && !startCv.isPending)
      startCv.mutate(look.language)
  }
  // Gone to the board's page: on coming back, ask whether the user applied. Only once the page
  // was really left (another tab or window) and is back: a posting opened in a background tab
  // leaves nothing to come back from, and a later unrelated return shouldn't ask.
  const [away, setAway] = useState(false)
  const [nudge, setNudge] = useState(false)
  useEffect(() => {
    if (!away) return
    let left = document.visibilityState === "hidden" || !document.hasFocus()
    const leave = () => {
      left = true
    }
    const back = () => {
      if (!left) return
      setAway(false)
      setNudge(true)
    }
    const visibility = () => (document.visibilityState === "hidden" ? leave() : back())
    // Still here a moment after the click: the posting opened behind, nothing to ask.
    const stay = window.setTimeout(() => {
      if (!left) setAway(false)
    }, 1500)
    window.addEventListener("blur", leave)
    window.addEventListener("focus", back)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.clearTimeout(stay)
      window.removeEventListener("blur", leave)
      window.removeEventListener("focus", back)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [away])

  return (
    <>
      <SheetHeader className="gap-3 px-6 pt-6 pb-4 pr-14">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SiteMark site={job.site} />
          {job.date_posted && (
            <>
              <span aria-hidden>·</span>
              <span title={fullDate(job.date_posted)}>{t.posted(relativeDay(job.date_posted))}</span>
            </>
          )}
        </div>
        <SheetTitle className="text-xl leading-tight font-semibold tracking-tight text-balance">{job.title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <Building2Icon className="size-3.5" />
            {job.company ?? t.noCompany}
          </span>
          {job.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon className="size-3.5" />
              {job.location}
            </span>
          )}
        </SheetDescription>
        {query && <SearchMatch url={job.url} query={query} listed={listed} />}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <a href={job.url} target="_blank" rel="noreferrer" onClick={() => setAway(true)}>
              {t.openPosting}
              <ArrowUpRightIcon />
            </a>
          </Button>
          {scoreFirst ? (
            <Button variant="outline" size="sm" onClick={score}>
              {scoring || startScore.isPending ? <LoaderCircleIcon className="animate-spin" /> : <GaugeIcon />}
              {t.scoreFit}
            </Button>
          ) : (
            !cv && (
              <Button variant="outline" size="sm" onClick={generate}>
                {writing || startCv.isPending ? <LoaderCircleIcon className="animate-spin" /> : <FilePenLineIcon />}
                {t.generateCv}
              </Button>
            )
          )}
          <ApplyControl job={job} onOpenApplication={onOpenApplication} />
          {/* Apart from the steps forward: the way out of a posting that isn't for you. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => (dismissed ? onRestore(job) : onDismiss(job))}
              >
                {dismissed ? <Undo2Icon /> : <EyeOffIcon />}
                {dismissed ? t.restore : t.hide}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{dismissed ? t.restoreHint : t.hideSheetHint}</TooltipContent>
          </Tooltip>
        </div>
      </SheetHeader>

      {/* Right under the actions it answers to. */}
      <ApplyNudge job={job} shown={nudge} onDismiss={() => setNudge(false)} onOpenApplication={onOpenApplication} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as JobTab)} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start gap-4 border-b px-6">
          <TabsTrigger value="posting" className="flex-none px-0">
            {t.tabPosting}
          </TabsTrigger>
          <TabsTrigger value="fit" className="flex-none px-0">
            <GaugeIcon />
            {t.tabFit}
            {fit?.value != null && (
              <span className="rounded-[5px] border px-1.5 text-xs font-medium tabular-nums">{formatScore(fit.value)}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="cv" className="flex-none px-0">
            <FileUserIcon />
            {t.tabCv}
            {writing ? (
              <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
            ) : (
              cv && <span className="size-1.5 rounded-full bg-emerald-500" />
            )}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="posting">
            <JobBody job={job} onPaste={onPaste} />
          </TabsContent>
          <TabsContent value="fit">
            <ScorePanel job={job} onOpenProfile={onOpenProfile} />
          </TabsContent>
          <TabsContent value="cv">
            <TailoredCv job={job} onOpenProfile={onOpenProfile} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </>
  )
}

function JobBody({ job, onPaste }: { job: Job; onPaste: (url: string, posting: PastedPosting) => Promise<void> }) {
  const all = useT()
  const t = all.jobs
  const [pasting, setPasting] = useState(false)
  const site = job.site === "linkedin" ? "LinkedIn" : "Indeed"
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b px-6 py-5 sm:grid-cols-4">
        <Meta label={t.mode}>
          <WorkModeBadge mode={job.work_mode} />
        </Meta>
        <Meta label={t.salary}>
          <span className="font-mono">{salaryLabel(job) ?? "—"}</span>
          {convertedLabel(job.salary_converted) && (
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
              {convertedLabel(job.salary_converted)}
            </span>
          )}
        </Meta>
        <Meta label={t.jobType}>
          {parseStoredJobTypes(job.job_type).map((jt) => all.jobTypes[jt]).join(", ") || "—"}
        </Meta>
        <Meta label={t.postedOn}>{fullDate(job.date_posted)}</Meta>
      </dl>

      {job.description ? (
        <article className="prose-job max-w-prose px-6 py-6">
          <Markdown>{job.description}</Markdown>
        </article>
      ) : !pasting ? (
        <div className="space-y-3 px-6 py-6">
          <p className="text-sm text-muted-foreground">{t.noDescription}</p>
          <Button size="sm" variant="outline" onClick={() => setPasting(true)}>
            <ClipboardPasteIcon />
            {all.link.paste.action}
          </Button>
        </div>
      ) : (
        <PastePosting
          site={site}
          url={job.url}
          initial={{ title: job.title, company: job.company ?? "", location: job.location ?? "" }}
          onSave={(posting) => onPaste(job.url, posting)}
          onCancel={() => setPasting(false)}
        />
      )}
    </>
  )
}

/** The sheet's shape while the posting is read, or why it couldn't be. */
function PendingDetails({
  pending,
  onClose,
  onPaste,
}: {
  pending: PendingJob
  onClose: () => void
  onPaste: (url: string, posting: PastedPosting) => Promise<void>
}) {
  const all = useT()
  const t = all.link
  const site = pending.site === "linkedin" ? "LinkedIn" : "Indeed"
  const [pasting, setPasting] = useState(false)
  if (pending.error)
    return (
      <ScrollArea className="min-h-0 flex-1">
        <SheetHeader className="gap-4 px-6 pt-6 pb-6 pr-14">
          <SiteMark site={pending.site} />
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-sm font-medium">{t.failed}</SheetTitle>
              <SheetDescription className="text-pretty">{pending.error}</SheetDescription>
            </div>
          </div>
          {!pasting && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setPasting(true)}>
                <ClipboardPasteIcon />
                {t.paste.action}
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={pending.url} target="_blank" rel="noreferrer">
                  {t.openOnSite(site)}
                  <ArrowUpRightIcon />
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                {all.common.close}
              </Button>
            </div>
          )}
        </SheetHeader>
        {pasting && <PastePosting site={site} url={pending.url} onSave={(p) => onPaste(pending.url, p)} onCancel={() => setPasting(false)} />}
      </ScrollArea>
    )
  return (
    <div aria-busy className="flex flex-col">
      <SheetHeader className="gap-3 px-6 pt-6 pb-4 pr-14">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SiteMark site={pending.site} />
          <span aria-hidden>·</span>
          <span className="text-shimmer">{t.reading}…</span>
        </div>
        <SheetTitle className="sr-only">{t.reading}</SheetTitle>
        <SheetDescription className="sr-only">{pending.url}</SheetDescription>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
        </div>
      </SheetHeader>
      <div className="space-y-3 border-t px-6 py-6">
        {[92, 78, 86, 64, 88, 70].map((w) => (
          <Skeleton key={w} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}
