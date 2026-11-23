import { useCallback, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Markdown from "react-markdown"
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  Building2Icon,
  CheckIcon,
  CircleHelpIcon,
  ClipboardPasteIcon,
  FilePenLineIcon,
  FileUserIcon,
  GaugeIcon,
  MapPinIcon,
  XIcon,
} from "lucide-react"

import { TailoredCv, type CvPhase } from "@/components/cv/tailored-cv"

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
import { convertedLabel, fullDate, relativeDay, salaryLabel } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { formatScore, shownScore, useScore } from "@/lib/job-score"
import { describe } from "@/lib/search-match"
import { cn } from "@/lib/utils"
import { parseStoredJobTypes } from "@/lib/job-types"
import { useGenerated } from "@/lib/cv-mock"
import { hasProfile, useProfile } from "@/lib/profile"

type Tab = "job" | "fit" | "cv"

const MATCH_ICON = {
  ok: { icon: CheckIcon, className: "text-emerald-600 dark:text-emerald-400" },
  unknown: { icon: CircleHelpIcon, className: "text-muted-foreground" },
  no: { icon: XIcon, className: "text-red-600 dark:text-red-400" },
}

/** The current search's conditions, met or not by this posting (no AI: the same rules as the filters). */
function SearchMatch({ url, query }: { url: string; query: Query }) {
  const t = useT().match
  // Only what the check reads: editing the title words or the free text doesn't refetch.
  const { scopes, salary_min, salary_currency, job_types, posted_within } = query
  const { data } = useQuery({
    queryKey: ["job-match", url, JSON.stringify([scopes, salary_min, salary_currency, job_types, posted_within])],
    queryFn: () => api.match(url, query),
    staleTime: 30_000,
  })
  const lines = (data?.checks ?? []).map(describe).filter((l) => l !== null)
  if (!lines.length) return null
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
  onClose,
  onPaste,
  onOpenProfile,
}: {
  job: Job | null
  pending?: PendingJob | null
  /** The search the sheet was opened from, to check the posting against; null: none. */
  query?: Query | null
  onClose: () => void
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
          <JobDetails key={job.url} job={job} query={query} onOpenProfile={onOpenProfile} onPaste={onPaste} />
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
  onOpenProfile,
  onPaste,
}: {
  job: Job
  query: Query | null
  onOpenProfile: () => void
  onPaste: (url: string, posting: PastedPosting) => Promise<void>
}) {
  const t = useT().jobs
  const state = useProfile()
  const already = useGenerated().has(job.url)
  const [tab, setTab] = useState<Tab>("job")
  const fit = shownScore(useScore(job.url).data)
  const [phase, setPhase] = useState<CvPhase>(already ? "done" : "idle")
  const generate = () => {
    setTab("cv")
    if (hasProfile(state)) setPhase("generating")
  }
  const done = useCallback(() => setPhase("done"), [])

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
        {query && <SearchMatch url={job.url} query={query} />}
        <div className="flex items-center gap-2 pt-1">
          <Button asChild size="sm">
            <a href={job.url} target="_blank" rel="noreferrer">
              {t.openPosting}
              <ArrowUpRightIcon />
            </a>
          </Button>
          {phase === "idle" && (
            <Button variant="outline" size="sm" onClick={generate}>
              <FilePenLineIcon />
              {t.generateCv}
            </Button>
          )}
        </div>
      </SheetHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start gap-4 border-b px-6">
          <TabsTrigger value="job" className="flex-none px-0">
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
            {already && <span className="size-1.5 rounded-full bg-emerald-500" />}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="job">
            <JobBody job={job} onPaste={onPaste} />
          </TabsContent>
          <TabsContent value="fit">
            <ScorePanel job={job} onOpenProfile={onOpenProfile} />
          </TabsContent>
          <TabsContent value="cv">
            <TailoredCv
              job={job}
              phase={phase}
              onGenerate={generate}
              onDone={done}
              onOpenProfile={onOpenProfile}
            />
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
