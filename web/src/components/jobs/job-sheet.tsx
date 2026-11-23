import { useCallback, useState } from "react"
import Markdown from "react-markdown"
import { ArrowUpRightIcon, Building2Icon, FilePenLineIcon, FileUserIcon, MapPinIcon } from "lucide-react"

import { TailoredCv, type CvPhase } from "@/components/cv/tailored-cv"

import { SiteMark, WorkModeBadge } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Job } from "@/lib/api"
import { convertedLabel, fullDate, relativeDay, salaryLabel } from "@/lib/format"
import { msgs, useT } from "@/lib/i18n"
import { parseStoredJobTypes } from "@/lib/job-types"
import { ANYWHERE } from "@/lib/run-messages"
import { useGenerated } from "@/lib/cv-mock"
import { hasProfile, useProfile } from "@/lib/profile"

/** Older hits have no label; their legacy key is "city|cc". */
function hitPlace(h: Job["hits"][number]): string {
  if (h.label === ANYWHERE || h.place === "*") return msgs().common.anywhere
  if (h.label) return h.label
  return h.place.startsWith("geo:") ? msgs().jobs.place : h.place.split("|")[0]
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  )
}

/**
 * Job details in a wide side panel: the list stays visible beside it, so moving
 * from one posting to the next keeps context (a modal would hide it).
 */
export function JobSheet({
  job,
  onClose,
  onOpenProfile,
}: {
  job: Job | null
  onClose: () => void
  onOpenProfile: () => void
}) {
  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      {/* The base sheet caps right panels at sm:max-w-sm via data-[side=right]:…;
          override with the same variant, or the higher-specificity cap wins. */}
      <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl">
        {/* Keyed by posting: tab and CV state start over for each one. */}
        {job && <JobDetails key={job.url} job={job} onOpenProfile={onOpenProfile} />}
      </SheetContent>
    </Sheet>
  )
}

function JobDetails({ job, onOpenProfile }: { job: Job; onOpenProfile: () => void }) {
  const t = useT().jobs
  const state = useProfile()
  const already = useGenerated().has(job.url)
  const [tab, setTab] = useState<"job" | "cv">("job")
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
          <span aria-hidden>·</span>
          <span title={fullDate(job.date_posted)}>{t.posted(relativeDay(job.date_posted))}</span>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "job" | "cv")} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start gap-4 border-b px-6">
          <TabsTrigger value="job" className="flex-none px-0">
            {t.tabPosting}
          </TabsTrigger>
          <TabsTrigger value="cv" className="flex-none px-0">
            <FileUserIcon />
            {t.tabCv}
            {already && <span className="size-1.5 rounded-full bg-emerald-500" />}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="job">
            <JobBody job={job} />
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

function JobBody({ job }: { job: Job }) {
  const all = useT()
  const t = all.jobs
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

      {job.hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-6 py-3">
          <span className="mr-1 text-xs text-muted-foreground">{t.foundWith}</span>
          {job.hits.map((h) => (
            <span key={`${h.place}:${h.keyword}`} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
              «{h.keyword}» · {hitPlace(h)}
            </span>
          ))}
        </div>
      )}

      <article className="prose-job max-w-prose px-6 py-6">
        {job.description ? <Markdown>{job.description}</Markdown> : <p>{t.noDescription}</p>}
      </article>
    </>
  )
}
