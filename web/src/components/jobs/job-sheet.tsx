import Markdown from "react-markdown"
import { ArrowUpRightIcon, Building2Icon, MapPinIcon } from "lucide-react"

import { SiteMark, WorkModeBadge } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Job } from "@/lib/api"
import { convertedLabel, fullDate, relativeDay, salaryLabel } from "@/lib/format"
import { JOB_TYPE_LABEL, parseStoredJobTypes } from "@/lib/job-types"

/** Older hits have no label; their legacy key is "city|cc". */
function hitPlace(h: Job["hits"][number]): string {
  if (h.label) return h.label
  if (h.place === "*") return "Ovunque"
  return h.place.startsWith("geo:") ? "luogo" : h.place.split("|")[0]
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
export function JobSheet({ job, onClose }: { job: Job | null; onClose: () => void }) {
  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      {/* The base sheet caps right panels at sm:max-w-sm via data-[side=right]:…;
          override with the same variant, or the higher-specificity cap wins. */}
      <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl">
        {job && (
          <>
            <SheetHeader className="gap-3 border-b px-6 pt-6 pb-5 pr-14">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SiteMark site={job.site} />
                <span aria-hidden>·</span>
                <span title={fullDate(job.date_posted)}>pubblicata {relativeDay(job.date_posted)}</span>
              </div>
              <SheetTitle className="text-xl leading-tight font-semibold tracking-tight text-balance">
                {job.title}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <Building2Icon className="size-3.5" />
                  {job.company ?? "Azienda non indicata"}
                </span>
                {job.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon className="size-3.5" />
                    {job.location}
                  </span>
                )}
              </SheetDescription>
              <div className="pt-1">
                <Button asChild size="sm">
                  <a href={job.url} target="_blank" rel="noreferrer">
                    Apri annuncio
                    <ArrowUpRightIcon />
                  </a>
                </Button>
              </div>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b px-6 py-5 sm:grid-cols-4">
                <Meta label="Modalità">
                  <WorkModeBadge mode={job.work_mode} />
                </Meta>
                <Meta label="Stipendio">
                  <span className="font-mono">{salaryLabel(job) ?? "—"}</span>
                  {convertedLabel(job.salary_converted) && (
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                      {convertedLabel(job.salary_converted)}
                    </span>
                  )}
                </Meta>
                <Meta label="Impiego">
                  {parseStoredJobTypes(job.job_type).map((t) => JOB_TYPE_LABEL[t]).join(", ") || "—"}
                </Meta>
                <Meta label="Pubblicata">{fullDate(job.date_posted)}</Meta>
              </dl>

              {job.hits.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b px-6 py-3">
                  <span className="mr-1 text-xs text-muted-foreground">Trovata con</span>
                  {job.hits.map((h) => (
                    <span key={`${h.place}:${h.keyword}`} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
                      «{h.keyword}» · {hitPlace(h)}
                    </span>
                  ))}
                </div>
              )}

              <article className="prose-job max-w-prose px-6 py-6">
                {job.description ? <Markdown>{job.description}</Markdown> : <p>Descrizione non disponibile.</p>}
              </article>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
