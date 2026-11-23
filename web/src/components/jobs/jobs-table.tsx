import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, InboxIcon, SearchXIcon, type LucideIcon } from "lucide-react"
import { AnimatePresence, motion, type Variants } from "motion/react"

import { CvMark } from "@/components/cv/tailored-cv"
import { SiteMark, WorkModeBadge } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Direction, Job, Sort } from "@/lib/api"
import { convertedLabel, fullDate, relativeDay, salaryLabel } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MotionBody = motion.create(TableBody)
const MotionRow = motion.create(TableRow)

// The first batch staggers in via the parent; rows mounted later (a running search)
// start from "hidden" and animate on their own, without the stagger delay.
const body: Variants = { show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } } }
const row: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
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

/** A column header that sorts the list: arrow shows the active column and direction. */
function SortableHead({
  field,
  sort,
  direction,
  onSort,
  className,
  children,
}: {
  field: Sort
  sort: Sort
  direction: Direction
  onSort: (sort: Sort) => void
  className?: string
  children: React.ReactNode
}) {
  const active = sort === field
  const Icon = !active ? ArrowUpDownIcon : direction === "desc" ? ArrowDownIcon : ArrowUpIcon
  return (
    <TableHead
      aria-sort={active ? (direction === "desc" ? "descending" : "ascending") : "none"}
      className="p-0"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          // Same look as the other headers; only the arrow tells it's sortable / active.
          "group/sort flex h-10 w-full items-center gap-1 px-2 font-medium",
          className,
        )}
      >
        {children}
        <Icon
          className={cn(
            "size-3.5 text-muted-foreground",
            !active && "opacity-0 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100",
          )}
        />
      </button>
    </TableHead>
  )
}

export function JobsTable({
  jobs,
  loading,
  overall,
  onOpen,
  onClearFilters,
  sort,
  direction,
  onSort,
  searchAction,
  searching = false,
}: {
  jobs: Job[]
  loading: boolean
  overall: number
  onOpen: (job: Job) => void
  onClearFilters: () => void
  sort: Sort
  direction: Direction
  onSort: (sort: Sort) => void
  /** Fetch new postings from the boards: the next step when nothing saved matches. */
  searchAction?: React.ReactNode
  /** A portal search is running: an empty list means "not yet", not "nothing found". */
  searching?: boolean
}) {
  const t = useT().jobs
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

  if (!jobs.length)
    return overall === 0 ? (
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
        description={t.noMatchHint(overall)}
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
          <SortableHead field="salary" sort={sort} direction={direction} onSort={onSort}>
            {t.salary}
          </SortableHead>
          <TableHead>{t.site}</TableHead>
          <SortableHead field="posted" sort={sort} direction={direction} onSort={onSort} className="pr-4">
            {t.postedOn}
          </SortableHead>
        </TableRow>
      </TableHeader>
      <MotionBody variants={body} initial="hidden" animate="show">
        <AnimatePresence initial={true}>
        {jobs.map((job) => (
          <MotionRow
            key={job.url}
            layout="position"
            variants={row}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="cursor-pointer"
            onClick={() => onOpen(job)}
          >
            <TableCell className="max-w-0 pl-4">
              <div className="truncate font-medium">
                {job.title}
                <CvMark url={job.url} />
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
            <TableCell>
              <SiteMark site={job.site} />
            </TableCell>
            <TableCell className="pr-4 text-xs text-muted-foreground tabular-nums">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{relativeDay(job.date_posted)}</span>
                </TooltipTrigger>
                <TooltipContent>{fullDate(job.date_posted)}</TooltipContent>
              </Tooltip>
            </TableCell>
          </MotionRow>
        ))}
        </AnimatePresence>
      </MotionBody>
    </Table>
  )
}
