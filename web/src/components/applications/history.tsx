import { useMemo } from "react"
import { ArrowUpRightIcon, FileUserIcon, GlobeIcon, XIcon } from "lucide-react"

import { FilterBar } from "@/components/applications/filter-bar"
import { StatusDot, StatusMenu } from "@/components/applications/status"
import { SiteMark } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  GROUP_OF,
  lastActivity,
  statusOf,
  type AppGroup,
  type Application,
} from "@/lib/applications-mock"
import { applyFilters, filtersActive, NO_FILTERS, type ListFilters } from "@/lib/application-filters"
import { fullDate, relativeDay } from "@/lib/format"
import { hostOf } from "@/lib/job-link"
import { intlTag, useT } from "@/lib/i18n"
import { DECISION_DOT, formatScore } from "@/lib/job-score"
import { passes, pickName, type FlowPick } from "@/lib/sankey"
import { cn } from "@/lib/utils"

const GROUPS: AppGroup[] = ["all", "saved", "active", "offer", "closed"]

/**
 * Every posting followed or applied to, newest activity first; the status changes in place.
 * `pick`, from the chart above, narrows it to the applications behind a node or a band.
 */
export function History({
  apps,
  group,
  onGroup,
  pick,
  onClearPick,
  openId,
  onOpenId,
  filters,
  onFilters,
}: {
  apps: Application[]
  filters: ListFilters
  onFilters: (f: ListFilters) => void
  group: AppGroup
  onGroup: (g: AppGroup) => void
  pick: FlowPick | null
  onClearPick: () => void
  /** The application whose sheet is open. */
  openId: string | null
  onOpenId: (id: string | null) => void
}) {
  const t = useT().applications
  // Chart pick, then the bar's filters and order; the status groups count what's left.
  const picked = useMemo(() => applyFilters(pick ? apps.filter((a) => passes(a, pick)) : apps, filters), [apps, pick, filters])
  const counts = useMemo(() => {
    const c: Record<AppGroup, number> = { all: picked.length, saved: 0, active: 0, offer: 0, closed: 0 }
    for (const a of picked) c[GROUP_OF[statusOf(a)]]++
    return c
  }, [picked])
  const shown = group === "all" ? picked : picked.filter((a) => GROUP_OF[statusOf(a)] === group)
  const narrowed = filtersActive(filters) || group !== "all" || !!pick
  const open = apps.find((a) => a.id === openId) ?? null

  return (
    <div className="space-y-3">
      <FilterBar value={filters} onChange={onFilters} />
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={group}
          onValueChange={(v) => v && onGroup(v as AppGroup)}
          variant="outline"
          size="sm"
          className="flex-wrap justify-start"
          aria-label={t.columns.status}
        >
          {GROUPS.map((g) => (
            <ToggleGroupItem key={g} value={g} className="gap-1.5 px-3 data-[state=on]:bg-muted">
              {t.groups[g]}
              <span className="text-xs text-muted-foreground tabular-nums">{counts[g]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {pick && (
          <span className="inline-flex h-8 items-center gap-1 rounded-md border border-foreground/30 bg-muted pr-1 pl-3 text-sm">
            {pickName(pick)}
            <span className="ml-0.5 text-xs text-muted-foreground tabular-nums">{picked.length}</span>
            <button
              type="button"
              onClick={onClearPick}
              aria-label={t.clearPick}
              className="ml-1 grid size-6 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {shown.length === 0 ? (
          <div className="space-y-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">{narrowed ? t.filters.noMatch : t.empty}</p>
            {narrowed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onFilters({ ...NO_FILTERS, sort: filters.sort })
                  onGroup("all")
                  onClearPick()
                }}
              >
                {t.filters.clear}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[42%] pl-4">{t.columns.position}</TableHead>
                <TableHead>{t.columns.status}</TableHead>
                <TableHead>{t.columns.score}</TableHead>
                <TableHead>{t.columns.activity}</TableHead>
                <TableHead className="pr-4">{t.columns.site}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => onOpenId(a.id)}>
                  <TableCell className="max-w-0 pl-4">
                    <div className="truncate font-medium">{a.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[a.company, a.location].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusMenu app={a} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {a.score ? (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className={cn("size-1.5 rounded-full", DECISION_DOT[a.score.decision])} />
                        {formatScore(a.score.value)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{relativeDay(lastActivity(a))}</span>
                      </TooltipTrigger>
                      <TooltipContent>{fullDate(lastActivity(a))}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="pr-4">
                    <Source app={a} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && onOpenId(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-md">{open && <Details app={open} />}</SheetContent>
      </Sheet>
    </div>
  )
}

/** Where the posting came from: the board's mark, or another site's host name. */
function Source({ app }: { app: Application }) {
  const t = useT().applications.add
  if (app.site !== "other") return <SiteMark site={app.site} />
  const host = hostOf(app.url)
  return (
    <span className="inline-flex max-w-40 items-center gap-1.5 text-xs text-muted-foreground">
      <GlobeIcon className="size-4 shrink-0" />
      <span className="truncate">{host || t.otherSite}</span>
    </span>
  )
}

/** One application: where it stands, how it got there. */
function Details({ app }: { app: Application }) {
  const all = useT()
  const t = all.applications
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(intlTag(), { day: "numeric", month: "short", year: "numeric" })
  return (
    <>
      <SheetHeader className="gap-3 border-b px-6 pt-6 pb-5 pr-14">
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
        <SheetTitle className="text-lg leading-tight font-semibold tracking-tight text-balance">{app.title}</SheetTitle>
        <SheetDescription>
          {[app.company, app.location].filter(Boolean).join(" · ")}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusMenu app={app} />
          {app.url && (
            <Button asChild size="xs" variant="ghost">
              <a href={app.url} target="_blank" rel="noreferrer">
                {t.openPosting}
                <ArrowUpRightIcon />
              </a>
            </Button>
          )}
        </div>
      </SheetHeader>
      <div className="space-y-6 overflow-y-auto px-6 py-6">
        {app.cv && (
          <p className="flex items-center gap-2 text-sm">
            <FileUserIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t.cv}</span>
            <span className="ml-auto">{app.cv}</span>
          </p>
        )}
        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold">{t.timeline}</h3>
          <ol className="relative space-y-4 border-l pl-5">
            {[...app.events].reverse().map((e, i) => (
              <li key={`${e.status}-${e.at}`} className="relative">
                <span className="absolute top-1.5 -left-[23.5px] grid size-2 place-items-center rounded-full bg-background ring-4 ring-background">
                  <StatusDot status={e.status} className={cn("size-2", i > 0 && "opacity-60")} />
                </span>
                <p className={cn("text-sm", i === 0 ? "font-medium" : "text-muted-foreground")}>{t.statuses[e.status]}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{when(e.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
