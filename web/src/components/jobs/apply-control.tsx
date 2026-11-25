import { ArrowRightIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { StatusDot, StatusMenu } from "@/components/applications/status"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Job } from "@/lib/api"
import {
  statusOf,
  useAddApplication,
  useAdding,
  useApplicationFor,
  useCvToSend,
  useDeleteApplication,
  type AppStatus,
} from "@/lib/applications"
import { msgs, useT } from "@/lib/i18n"

/**
 * Track a posting from its sheet, in one click: the server takes the saved posting's text, so
 * there is nothing to fill in. Says so with a toast that can undo it or open it; one already
 * tracked (added meanwhile elsewhere) is only pointed to: undoing would remove it.
 */
export function useApply(job: Job, onOpenApplication: (id: number) => void) {
  const { application, known } = useApplicationFor(job.url)
  const add = useAddApplication()
  const remove = useDeleteApplication()
  // Shared by every control for this posting, so the nudge and the button can't add it twice.
  const pending = useAdding(job.url)
  const cv = useCvToSend(job.url)
  const apply = (status: AppStatus) => {
    if (pending) return
    const all = msgs().applications
    const t = all.apply
    add.mutate(
      {
        url: job.url,
        title: job.title,
        company: job.company ?? "",
        location: job.location ?? "",
        description: job.description ?? "",
        status,
        // The CV generated for this posting is the one sent.
        cv: status !== "saved" ? cv : null,
      },
      {
        onSuccess: ({ application: a, created }) =>
          created
            ? toast(status === "saved" ? t.savedForLater : t.added, {
                description: a.title,
                action: { label: t.open, onClick: () => onOpenApplication(a.id) },
                cancel: { label: t.undo, onClick: () => remove.mutate(a.id) },
              })
            : toast(all.add.duplicate, {
                description: a.title,
                action: { label: t.open, onClick: () => onOpenApplication(a.id) },
              }),
        onError: (e) => toast.error(e.message),
      },
    )
  }
  // Until the list arrives, "not tracked" isn't known: no offer to apply meanwhile.
  return { application, known, apply, pending }
}

/**
 * The sheet's application action. Not tracked: "I applied" (and, in its menu, "Save for
 * later"). Tracked: its status, the same pill as on the Applications page, and a way there.
 */
export function ApplyControl({ job, onOpenApplication }: { job: Job; onOpenApplication: (id: number) => void }) {
  const t = useT().applications.apply
  const { application, known, apply, pending } = useApply(job, onOpenApplication)

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
      <Button size="sm" className="rounded-r-none" disabled={pending || !known} onClick={() => apply("applied")}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
        {t.applied}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            className="rounded-l-none border-l border-background/20"
            disabled={pending || !known}
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
  const { application, known, apply, pending } = useApply(job, onOpenApplication)
  if (!shown || !known || application) return null
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
  const { application } = useApplicationFor(url)
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
