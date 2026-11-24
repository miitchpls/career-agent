import { ArrowRightIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { StatusDot, StatusMenu } from "@/components/applications/status"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Job } from "@/lib/api"
import {
  statusOf,
  useAddApplication,
  useApplicationFor,
  useDeleteApplication,
  type AppStatus,
} from "@/lib/applications"
import { useCvPrefs } from "@/lib/cv-prefs"
import { useGenerated } from "@/lib/cv-mock"
import { msgs, useT } from "@/lib/i18n"

/**
 * Track a posting from its sheet, in one click: the server takes the saved posting's text, so
 * there is nothing to fill in. Says so with a toast that can undo it or open it.
 */
export function useApply(job: Job, onOpenApplication: (id: number) => void) {
  const application = useApplicationFor(job.url)
  const add = useAddApplication()
  const remove = useDeleteApplication()
  const generated = useGenerated().has(job.url)
  const prefs = useCvPrefs()
  const apply = (status: AppStatus) => {
    const t = msgs().applications.apply
    add.mutate(
      {
        url: job.url,
        title: job.title,
        company: job.company ?? "",
        location: job.location ?? "",
        description: job.description ?? "",
        status,
        // The CV generated for this posting is the one sent.
        cv: generated && status !== "saved" ? msgs().cv.templates[prefs.style].name : null,
      },
      {
        onSuccess: ({ application: a }) =>
          toast(status === "saved" ? t.savedForLater : t.added, {
            description: a.title,
            action: { label: t.open, onClick: () => onOpenApplication(a.id) },
            cancel: { label: t.undo, onClick: () => remove.mutate(a.id) },
          }),
        onError: (e) => toast.error(e.message),
      },
    )
  }
  return { application, apply, pending: add.isPending }
}

/**
 * The sheet's application action. Not tracked: "I applied" (and, in its menu, "Save for
 * later"). Tracked: its status, the same pill as on the Applications page, and a way there.
 */
export function ApplyControl({ job, onOpenApplication }: { job: Job; onOpenApplication: (id: number) => void }) {
  const t = useT().applications.apply
  const { application, apply, pending } = useApply(job, onOpenApplication)

  if (application)
    return (
      <>
        <StatusMenu app={application} />
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onOpenApplication(application.id)}>
          {t.seeInApplications}
          <ArrowRightIcon />
        </Button>
      </>
    )
  return (
    <div className="inline-flex">
      <Button size="sm" className="rounded-r-none" disabled={pending} onClick={() => apply("applied")}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
        {t.applied}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            className="rounded-l-none border-l border-background/20"
            disabled={pending}
            aria-label={t.more}
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => apply("saved")}>
            <BookmarkIcon />
            {t.saveForLater}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Back from the board's page (the window regains focus after "Open posting"), a quiet question:
 * did you apply? One click says yes; it goes away if ignored or closed.
 */
export function ApplyNudge({
  job,
  shown,
  onDismiss,
  onOpenApplication,
}: {
  job: Job
  shown: boolean
  onDismiss: () => void
  onOpenApplication: (id: number) => void
}) {
  const t = useT().applications.apply
  const { application, apply, pending } = useApply(job, onOpenApplication)
  if (!shown || application) return null
  return (
    <div className="flex items-center gap-3 border-t bg-muted/50 px-6 py-2.5 text-sm">
      <span className="min-w-0 flex-1 text-pretty">{t.nudge}</span>
      <Button size="xs" disabled={pending} onClick={() => apply("applied")}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
        {t.nudgeYes}
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.dismiss}
        className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

/** Beside a posting's title in the list: where its application stands, if it's tracked. */
export function ApplicationMark({ url }: { url: string }) {
  const t = useT().applications
  const application = useApplicationFor(url)
  if (!application) return null
  const status = statusOf(application)
  return (
    <span
      className="ml-1.5 inline-flex h-4 items-center gap-1 rounded border px-1 align-middle text-[10px] font-medium text-muted-foreground"
      title={t.apply.tracked}
    >
      <StatusDot status={status} className="size-1" />
      {t.statuses[status]}
    </span>
  )
}
