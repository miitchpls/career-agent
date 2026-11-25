import { useMemo } from "react"
import { WorkflowIcon } from "lucide-react"

import { ApplicationSheet, Source } from "@/components/applications/application-sheet"
import { Chip, SearchBox, SortMenu } from "@/components/applications/filter-bar"
import { StatusMenu } from "@/components/applications/status"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GROUP_OF, lastActivity, statusOf, type AppGroup, type Application } from "@/lib/applications"
import { applyFilters, filtersActive, NO_FILTERS, type ListFilters } from "@/lib/application-filters"
import { fullDate, relativeDay } from "@/lib/format"
import { useT } from "@/lib/i18n"
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
  onOpenProfile,
  everything,
}: {
  onOpenProfile: () => void
  /** Every application, whatever the period. */
  everything?: Application[]
  apps: Application[]
  filters: ListFilters
  onFilters: (f: ListFilters) => void
  group: AppGroup
  onGroup: (g: AppGroup) => void
  pick: FlowPick | null
  onClearPick: () => void
  /** The application whose sheet is open. */
  openId: number | null
  onOpenId: (id: number | null) => void
}) {
  const t = useT().applications
  // Chart pick, then the bar's filters and order; the status groups count what's left.
  const picked = useMemo(
    () => applyFilters(pick ? apps.filter((a) => passes(a, pick)) : apps, filters),
    [apps, pick, filters],
  )
  const counts = useMemo(() => {
    const c: Record<AppGroup, number> = { all: picked.length, saved: 0, active: 0, offer: 0, closed: 0 }
    for (const a of picked) c[GROUP_OF[statusOf(a)]]++
    return c
  }, [picked])
  const shown = group === "all" ? picked : picked.filter((a) => GROUP_OF[statusOf(a)] === group)
  const narrowed = filtersActive(filters) || group !== "all" || !!pick
  const clearAll = () => {
    onFilters({ ...NO_FILTERS, sort: filters.sort })
    onGroup("all")
    onClearPick()
  }
  // Looked up among all of them: one opened from elsewhere (a duplicate's "Open") may be
  // outside the period.
  const open = (everything ?? apps).find((a) => a.id === openId) ?? null

  return (
    <div className="space-y-4">
      {/* One row: which applications (status), narrowed by the chart's pick; then search and order. */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={group} onValueChange={(v) => onGroup(v as AppGroup)}>
          <TabsList aria-label={t.columns.status}>
            {GROUPS.map((g) => (
              <TabsTrigger key={g} value={g} className="gap-1.5 px-3">
                {t.groups[g]}
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{counts[g]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {pick && (
          <Chip label={t.clearPick} onRemove={onClearPick}>
            <WorkflowIcon className="size-3.5 text-muted-foreground" />
            {pickName(pick)}
          </Chip>
        )}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <SearchBox value={filters.q} onChange={(q) => onFilters({ ...filters, q })} />
          <SortMenu value={filters.sort} onChange={(sort) => onFilters({ ...filters, sort })} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {shown.length === 0 ? (
          <div className="space-y-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">{narrowed ? t.filters.noMatch : t.empty}</p>
            {narrowed && (
              <Button variant="outline" size="sm" onClick={clearAll}>
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
        {/* As wide as a posting's sheet: the posting and the CV are read here too. */}
        <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl">
          {open && <ApplicationSheet key={open.id} app={open} onOpenProfile={onOpenProfile} onRemoved={() => onOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
