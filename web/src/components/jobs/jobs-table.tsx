import { useEffect, useRef, useState } from "react"
import { EyeIcon, EyeOffIcon, InboxIcon, SearchXIcon, TriangleAlertIcon, Undo2Icon, type LucideIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition, type Variants } from "motion/react"

import { CvMark } from "@/components/cv/tailored-cv"
import { ApplicationMark } from "@/components/jobs/apply-control"
import { SiteMark, WorkModeBadge } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Job } from "@/lib/api"
import { convertedLabel, fullDate, relativeDay, salaryLabel } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { DECISION_DOT, formatScore } from "@/lib/job-score"
import { missedFilters } from "@/lib/search-match"
import { cn } from "@/lib/utils"

const MotionBody = motion.create(TableBody)
const MotionRow = motion.create(TableRow)

// The first batch staggers in via the parent; rows mounted later (a running search)
// start from "hidden" and animate on their own, without the stagger delay.
const body: Variants = { show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } }
const row: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, filter: "blur(0px)", x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
}
/** A row the filters took out: it just fades. */
const FADE: TargetAndTransition = { opacity: 0, transition: { duration: 0.12 } }
/**
 * A row the user hid: it slips aside and blurs away, then the rows below close the gap (their
 * layout animation), two beats rather than one jump. To the left: overflow on that side can't
 * be scrolled to, so the table's horizontal scrollbar doesn't flash while it leaves.
 */
const TOSS: TargetAndTransition = {
  opacity: 0,
  x: -20,
  filter: "blur(3px)",
  transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
}
/** The rows below glide up into the space a row left. */
const GLIDE = { layout: { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } } as const

/** A hidden posting shown with the others («N nascoste» pressed): dimmed, labelled. */
function HiddenMark() {
  const t = useT().jobs
  return (
    <span className="ml-1.5 inline-flex h-4 items-center gap-0.5 rounded border px-1 align-middle text-[10px] font-medium text-muted-foreground">
      <EyeOffIcon className="size-2.5" />
      {t.hiddenMark}
    </span>
  )
}

/** The end of a row: hide it (shown on hover or focus) or, once hidden, restore it. */
function HideButton({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const t = useT().jobs
  const label = hidden ? t.restore : t.hideHint
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation() // not a click on the row, which opens the posting
            onClick()
          }}
          className={cn(
            "text-muted-foreground transition-opacity hover:text-foreground focus-visible:opacity-100",
            // Touch screens have no hover: the button stays in sight there.
            !hidden && "opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          {/* The new icon pops in with a small turn: restoring reads as the opposite gesture. */}
          <motion.span
            key={hidden ? "restore" : "hide"}
            initial={{ opacity: 0, scale: 0.6, rotate: hidden ? -90 : 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="grid place-items-center"
          >
            {hidden ? <Undo2Icon /> : <EyeOffIcon />}
          </motion.span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * An opened posting whose page says what its list card didn't, against the filters: it stays
 * where it was (rows never vanish under the user), marked like the row's other marks.
 */
function OffFiltersMark({ kinds }: { kinds: NonNullable<Job["unmet"]> }) {
  const t = useT().jobs
  if (!kinds.length) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="ml-1.5 inline-flex h-4 cursor-default items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 align-middle text-[10px] font-medium text-amber-700 dark:text-amber-300"
          aria-label={t.offFiltersHint(missedFilters(kinds))}
        >
          <TriangleAlertIcon className="size-2.5" />
          {t.offFilters}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{t.offFiltersHint(missedFilters(kinds))}</TooltipContent>
    </Tooltip>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <div className="grid size-10 place-items-center rounded-lg border bg-background shadow-xs">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function JobsTable({
  jobs,
  loading,
  loaded,
  dismissed,
  showDismissed = false,
  onOpen,
  onDismiss,
  onRestore,
  onShowDismissed,
  onClearFilters,
  searchAction,
  searching = false,
}: {
  /** The postings that meet the filters, hidden ones included. */
  jobs: Job[]
  loading: boolean
  /** Postings the search loaded, before the filters. */
  loaded: number
  /** The links of the postings the user hid: left out, unless `showDismissed`. */
  dismissed: ReadonlySet<string>
  /** Show the hidden postings too, dimmed, each with its button to restore it. */
  showDismissed?: boolean
  onOpen: (job: Job) => void
  onDismiss: (job: Job) => void
  onRestore: (job: Job) => void
  onShowDismissed: () => void
  onClearFilters: () => void
  /** Read the search from the boards: the next step when nothing is loaded. */
  searchAction?: React.ReactNode
  /** A portal search is running: an empty list means "not yet", not "nothing found". */
  searching?: boolean
}) {
  const t = useT().jobs
  const reduced = useReducedMotion()
  const visible = showDismissed ? jobs : jobs.filter((j) => !dismissed.has(j.url))
  const allHidden = visible.length === 0 && jobs.length > 0
  // Hiding the last row: the table stays until the row has left, then the empty state comes.
  // (State adjusted during render when rows come back; set after the exit otherwise.)
  const [drained, setDrained] = useState(visible.length === 0)
  if (visible.length > 0 && drained) setDrained(false)
  const shown = useRef(visible.length)
  useEffect(() => {
    shown.current = visible.length
  })
  const exit = (url: string) => (gone: ReadonlySet<string> | undefined) =>
    gone?.has(url) ? (reduced ? { opacity: 0, transition: { duration: 0.15 } } : TOSS) : FADE

  if (loading)
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )

  if (!jobs.length && searching)
    return (
      <div aria-live="polite" className="space-y-2 p-4">
        {[1, 0.7, 0.45].map((o) => (
          <Skeleton key={o} className="h-10 w-full" style={{ opacity: o }} />
        ))}
        <p className="pt-3 pb-2 text-center text-sm text-muted-foreground">
          {t.arriving}
        </p>
      </div>
    )

  if (allHidden && drained)
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
        <EmptyState
          icon={EyeOffIcon}
          title={t.allHidden}
          description={t.allHiddenHint(jobs.length)}
          action={
            <Button variant="outline" size="sm" onClick={onShowDismissed}>
              <EyeIcon />
              {t.showHidden}
            </Button>
          }
        />
      </motion.div>
    )

  if (!jobs.length)
    return loaded === 0 ? (
      <EmptyState
        icon={InboxIcon}
        title={t.noneSaved}
        description={t.noneSavedHint}
        action={searchAction}
      />
    ) : (
      <EmptyState
        icon={SearchXIcon}
        title={t.noMatch}
        description={t.noMatchHint(loaded)}
        action={
          <div className="flex items-center gap-2">
            {searchAction}
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {t.clearFilters}
            </Button>
          </div>
        }
      />
    )

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[42%] pl-4">{t.position}</TableHead>
          <TableHead>{t.location}</TableHead>
          <TableHead>{t.mode}</TableHead>
          <TableHead>{t.salary}</TableHead>
          <TableHead>{t.scoreColumn}</TableHead>
          <TableHead>{t.site}</TableHead>
          <TableHead>{t.postedOn}</TableHead>
          <TableHead className="w-10 pr-3">
            <span className="sr-only">{t.hideHint}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <MotionBody variants={body} initial="hidden" animate="show">
        {/* `custom`: a leaving row reads the hidden links of now, so it knows whether it was
            hidden (its own props are frozen once it's gone). */}
        <AnimatePresence
          initial={true}
          custom={dismissed}
          onExitComplete={() => shown.current === 0 && setDrained(true)}
        >
        {visible.map((job) => {
          const hidden = dismissed.has(job.url)
          return (
          <MotionRow
            key={job.url}
            layout="position"
            variants={{ ...row, exit: exit(job.url) }}
            exit="exit"
            transition={GLIDE}
            className={cn(
              "group/row cursor-pointer [&>td]:transition-opacity [&>td]:duration-300",
              hidden && "[&>td:not(:last-child)]:opacity-50",
            )}
            onClick={() => onOpen(job)}
          >
            <TableCell className="max-w-0 pl-4">
              <div className="truncate font-medium">
                {job.title}
                {hidden && <HiddenMark />}
                <OffFiltersMark kinds={job.unmet ?? []} />
                <CvMark shown={!!job.has_cv} />
                <ApplicationMark url={job.url} />
              </div>
              <div className="truncate text-xs text-muted-foreground">{job.company ?? "—"}</div>
            </TableCell>
            <TableCell className="max-w-48 truncate text-muted-foreground">{job.location || "—"}</TableCell>
            <TableCell>
              <WorkModeBadge mode={job.work_mode} />
            </TableCell>
            <TableCell className="font-mono text-xs tabular-nums">
              {salaryLabel(job) ?? <span className="text-muted-foreground">—</span>}
              {convertedLabel(job.salary_converted) && (
                <div className="text-[11px] text-muted-foreground">{convertedLabel(job.salary_converted)}</div>
              )}
            </TableCell>
            <TableCell className="text-xs tabular-nums">
              {job.score ? (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className={cn("size-1.5 rounded-full", DECISION_DOT[job.score.decision])} />
                  {formatScore(job.score.value)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <SiteMark site={job.site} />
            </TableCell>
            <TableCell className="text-xs text-muted-foreground tabular-nums">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{relativeDay(job.date_posted)}</span>
                </TooltipTrigger>
                <TooltipContent>{fullDate(job.date_posted)}</TooltipContent>
              </Tooltip>
            </TableCell>
            <TableCell className="w-10 pr-3 text-right">
              <HideButton hidden={hidden} onClick={() => (hidden ? onRestore(job) : onDismiss(job))} />
            </TableCell>
          </MotionRow>
          )
        })}
        </AnimatePresence>
      </MotionBody>
    </Table>
  )
}
