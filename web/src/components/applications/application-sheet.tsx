import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Markdown from "react-markdown"
import {
  ArrowDownToLineIcon,
  ArrowUpRightIcon,
  LoaderCircleIcon,
  ClipboardPasteIcon,
  FileTextIcon,
  GaugeIcon,
  FileUserIcon,
  GlobeIcon,
  NotebookPenIcon,
  Trash2Icon,
} from "lucide-react"

import { StatusDot, StatusMenu } from "@/components/applications/status"
import { TailoredCv, type CvPhase } from "@/components/cv/tailored-cv"
import { ScorePanel } from "@/components/jobs/score-panel"
import { SiteMark } from "@/components/jobs/work-mode-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, type Job } from "@/lib/api"
import { cvName, useDeleteApplication, useUpdateApplication, type Application } from "@/lib/applications"
import { DEFAULT_CURRENCY } from "@/lib/currencies"
import { useGenerated } from "@/lib/cv-mock"
import { intlTag, useT } from "@/lib/i18n"
import { DECISION_DOT, formatScore } from "@/lib/job-score"
import { hostOf } from "@/lib/job-link"
import { hasProfile, useProfile } from "@/lib/profile"
import { cn } from "@/lib/utils"

type Tab = "progress" | "fit" | "notes" | "posting" | "cv"

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(intlTag(), { day: "numeric", month: "short", year: "numeric" })

/** Where the posting came from: the board's mark, or another site's host name. */
export function Source({ app }: { app: Application }) {
  const t = useT().applications.add
  if (app.site !== "other") return <SiteMark site={app.site} />
  return (
    <span className="inline-flex max-w-40 items-center gap-1.5 text-xs text-muted-foreground">
      <GlobeIcon className="size-4 shrink-0" />
      <span className="truncate">{hostOf(app.url) || t.otherSite}</span>
    </span>
  )
}

/** The application as a posting, for the CV generation (which reads its title and text). */
function asJob(app: Application): Job {
  return {
    url: app.url || `application:${app.id}`,
    site: app.site === "other" ? "linkedin" : app.site,
    title: app.title,
    company: app.company || null,
    location: app.location || null,
    work_mode: "unknown",
    job_type: null,
    date_posted: null,
    min_amount: null,
    max_amount: null,
    currency: null,
    description: app.posting?.description ?? null,
    first_seen: app.events[0].at,
    salary_converted: null,
    hits: [],
    score: app.score,
  }
}

/**
 * One application in a wide side panel: how it's going (the default), the user's notes, the
 * posting as saved when it was added, and the CV generated for it.
 */
export function ApplicationSheet({
  app,
  onOpenProfile,
  onRemoved,
}: {
  app: Application
  onOpenProfile: () => void
  onRemoved: () => void
}) {
  const all = useT()
  const remove = useDeleteApplication()
  const [confirm, setConfirm] = useState(false)
  const t = all.applications.sheet
  const job = useMemo(() => asJob(app), [app])
  const generated = useGenerated().has(job.url)
  const profile = useProfile()
  const [tab, setTab] = useState<Tab>("progress")
  const [phase, setPhase] = useState<CvPhase>(generated ? "done" : "idle")
  const generate = () => {
    setTab("cv")
    if (hasProfile(profile)) setPhase("generating")
  }
  const done = useCallback(() => setPhase("done"), [])

  return (
    <>
      <SheetHeader className="gap-3 px-6 pt-6 pb-4 pr-14">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Source app={app} />
          {app.score && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <span className={cn("size-1.5 rounded-full", DECISION_DOT[app.score.decision])} />
                {formatScore(app.score.value)}
              </span>
            </>
          )}
        </div>
        <SheetTitle className="text-xl leading-tight font-semibold tracking-tight text-balance">{app.title}</SheetTitle>
        <SheetDescription>{[app.company, app.location].filter(Boolean).join(" · ")}</SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusMenu app={app} />
          {app.url && (
            <Button asChild size="sm" variant="outline">
              <a href={app.url} target="_blank" rel="noreferrer">
                {all.applications.openPosting}
                <ArrowUpRightIcon />
              </a>
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setConfirm(true)}>
            <Trash2Icon />
            {t.remove}
          </Button>
        </div>
      </SheetHeader>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.removeHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{all.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(app.id, { onSuccess: onRemoved })}>
              {t.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-0 flex-1 gap-0">
        <TabsList variant="line" className="h-10 w-full justify-start gap-5 border-b px-6">
          <TabsTrigger value="progress" className="flex-none px-0">
            {t.progress}
          </TabsTrigger>
          <TabsTrigger value="fit" className="flex-none px-0">
            <GaugeIcon />
            {t.fit}
            {app.score && (
              <span className="rounded-[5px] border px-1.5 text-xs font-medium tabular-nums">
                {formatScore(app.score.value)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-none px-0">
            <NotebookPenIcon />
            {t.notes}
            {app.notes.trim() && <span className="size-1.5 rounded-full bg-foreground/40" aria-hidden />}
          </TabsTrigger>
          <TabsTrigger value="posting" className="flex-none px-0">
            <FileTextIcon />
            {t.posting}
          </TabsTrigger>
          <TabsTrigger value="cv" className="flex-none px-0">
            <FileUserIcon />
            {t.cv}
            {generated && <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="progress">
            <Progress app={app} />
          </TabsContent>
          <TabsContent value="fit">
            <Fit app={app} onOpenProfile={onOpenProfile} />
          </TabsContent>
          <TabsContent value="notes">
            <Notes app={app} />
          </TabsContent>
          <TabsContent value="posting">
            <Posting app={app} />
          </TabsContent>
          <TabsContent value="cv">
            <TailoredCv job={job} phase={phase} onGenerate={generate} onDone={done} onOpenProfile={onOpenProfile} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </>
  )
}

function Progress({ app }: { app: Application }) {
  const all = useT()
  const t = all.applications
  return (
    <div className="space-y-6 px-6 py-6">
      {app.cv && (
        <p className="flex items-center gap-2 text-sm">
          <FileUserIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">{t.cv}</span>
          <span className="ml-auto">{cvName(app.cv)}</span>
        </p>
      )}
      <ol className="relative space-y-5 border-l pl-5">
        {[...app.events].reverse().map((e, i) => (
          <li key={`${e.status}-${e.at}`} className="relative">
            <span className="absolute top-1.5 -left-[23.5px] grid size-2 place-items-center rounded-full bg-background ring-4 ring-background">
              <StatusDot status={e.status} className={cn("size-2", i > 0 && "opacity-60")} />
            </span>
            <p className={cn("text-sm", i === 0 ? "font-medium" : "text-muted-foreground")}>{t.statuses[e.status]}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{day(e.at)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The saved posting behind an application's LinkedIn or Indeed link (from the database only),
 * and a way to read it from the board when it isn't saved, as opening its link does. Shared by
 * the Fit and Posting tabs, so a read in one shows in the other.
 */
function useSavedJob(app: Application) {
  const client = useQueryClient()
  const board = app.site !== "other" && !!app.url
  const saved = useQuery({
    queryKey: ["job-saved", app.url],
    queryFn: () => api.savedJob(app.url, DEFAULT_CURRENCY),
    enabled: board,
    staleTime: Infinity,
  })
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const read = async (): Promise<Job | null> => {
    setReading(true)
    setError(null)
    try {
      const r = await api.openLink(app.url, DEFAULT_CURRENCY)
      // Now saved: every view of it refreshes.
      client.setQueryData(["job-saved", app.url], { job: r.job })
      if (!r.known) for (const key of ["jobs", "job-match"]) void client.invalidateQueries({ queryKey: [key] })
      return r.job
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setReading(false)
    }
  }
  return { board, saved, read, reading, error, setError }
}

/**
 * The fit score, as on a posting's sheet. It's computed on the saved posting, so it needs a
 * LinkedIn or Indeed one; reading it here saves it, like opening it from a link.
 */
function Fit({ app, onOpenProfile }: { app: Application; onOpenProfile: () => void }) {
  const all = useT()
  const t = all.applications.sheet
  const { board, saved, read, reading, error } = useSavedJob(app)

  if (board && saved.isPending)
    return (
      <div className="space-y-3 px-6 py-8">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  if (board && saved.data?.job) return <ScorePanel job={saved.data.job} onOpenProfile={onOpenProfile} />
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">{board ? t.fitNotSaved : t.fitOther}</p>
      {board && (
        <Button size="sm" disabled={reading} onClick={() => void read()}>
          {reading ? <LoaderCircleIcon className="animate-spin" /> : <ArrowDownToLineIcon />}
          {t.read}
        </Button>
      )}
      {error && <p className="max-w-sm text-xs text-pretty text-destructive">{error}</p>}
    </div>
  )
}

/** Saved as typed: there's nothing to confirm. */
function Notes({ app }: { app: Application }) {
  const t = useT().applications.sheet
  const update = useUpdateApplication()
  const mutate = useRef(update.mutate)
  useEffect(() => {
    mutate.current = update.mutate
  })
  const [text, setText] = useState(app.notes)
  // Saved a moment after typing stops, and when leaving the tab with changes pending.
  const pending = useRef<{ id: number; notes: string } | null>(null)
  const flush = useCallback(() => {
    if (pending.current) mutate.current(pending.current)
    pending.current = null
  }, [])
  useEffect(() => {
    if (text === app.notes) return
    pending.current = { id: app.id, notes: text }
    const timer = window.setTimeout(flush, 600)
    return () => window.clearTimeout(timer)
  }, [text, app.id, app.notes, flush])
  useEffect(() => () => flush(), [flush])
  return (
    <div className="space-y-2 px-6 py-6">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={flush}
        placeholder={t.notesPlaceholder}
        aria-label={t.notes}
        className="min-h-64 resize-y"
      />
      <p className="text-xs text-muted-foreground">{t.notesHint}</p>
    </div>
  )
}

/** The copy kept with the application; one added without it can take its text now. */
function Posting({ app }: { app: Application }) {
  const all = useT()
  const update = useUpdateApplication()
  const setPosting = useCallback((posting: string) => update.mutate({ id: app.id, posting }), [update, app.id])
  const copied = useRef(false)
  const t = all.applications.sheet
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState("")
  const { board: fromBoard, saved, read: readJob, reading, error, setError } = useSavedJob(app)
  const board = !app.posting && fromBoard
  const found = saved.data?.job?.description?.trim()
  useEffect(() => {
    // Once: a failed save says so, and the buttons below stay.
    if (!app.posting && found && !copied.current) {
      copied.current = true
      setPosting(found)
    }
  }, [app.posting, found, setPosting])

  /** Not among the saved postings: read it from the board, as "Add" does. */
  const read = async () => {
    const job = await readJob()
    if (!job) return
    if (job.description?.trim()) setPosting(job.description)
    else setError(t.readEmpty)
  }

  if (app.posting)
    return (
      <div>
        <p className="border-b bg-muted/40 px-6 py-2.5 text-xs text-muted-foreground">
          {t.postingSaved(day(app.posting.savedAt))}
        </p>
        <article className="prose-job max-w-prose px-6 py-6">
          <Markdown>{app.posting.description}</Markdown>
        </article>
      </div>
    )
  if (board && (saved.isPending || (found && !update.isError)))
    return (
      <div className="space-y-3 px-6 py-6" aria-busy>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    )
  if (pasting)
    return (
      <div className="space-y-3 px-6 py-6">
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.pastePlaceholder}
          aria-label={t.posting}
          className="max-h-96 min-h-48"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={!text.trim()} onClick={() => setPosting(text)}>
            {all.common.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
            {all.common.cancel}
          </Button>
        </div>
      </div>
    )
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-sm font-medium">{t.noPosting}</p>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">{board ? t.notSavedHint : t.noPostingHint}</p>
      <div className="flex gap-2">
        {board && (
          <Button size="sm" disabled={reading} onClick={() => void read()}>
            {reading ? <LoaderCircleIcon className="animate-spin" /> : <ArrowDownToLineIcon />}
            {t.read}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setPasting(true)}>
          <ClipboardPasteIcon />
          {t.paste}
        </Button>
      </div>
      {error && <p className="max-w-sm text-xs text-pretty text-destructive">{error}</p>}
    </div>
  )
}
