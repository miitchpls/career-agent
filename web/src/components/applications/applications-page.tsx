import { useMemo, useState } from "react"

import { AddApplication } from "@/components/applications/add-application"
import { PeriodSelect } from "@/components/applications/filter-bar"
import { FlowChart } from "@/components/applications/flow-chart"
import { History } from "@/components/applications/history"
import { inPeriod, NO_FILTERS, type ListFilters, type Period } from "@/lib/application-filters"
import { summary, useApplications, type AppGroup } from "@/lib/applications"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { FlowPick } from "@/lib/sankey"

/**
 * Applications, general to particular: the key numbers, how the lot flows (a click on the chart
 * filters the list), and the list, where each status changes.
 */
export function ApplicationsPage({ onOpenProfile }: { onOpenProfile: () => void }) {
  const t = useT().applications
  const list = useApplications()
  const all = useMemo(() => list.data ?? [], [list.data])
  const [period, setPeriod] = useState<Period>(null)
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS)
  // The period is the page's: numbers, chart and list all speak of the same applications.
  const apps = useMemo(() => all.filter((a) => inPeriod(a, period)), [all, period])
  const s = summary(apps)
  const [group, setGroup] = useState<AppGroup>("all")
  const [pick, setPick] = useState<FlowPick | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const stats = [
    { label: t.stats.sent, value: s.sent, sub: null },
    { label: t.stats.answered, value: s.answered, sub: t.of(s.answered, s.sent) },
    { label: t.stats.interviews, value: s.interviews, sub: t.of(s.interviews, s.sent) },
    { label: t.stats.offers, value: s.offers, sub: t.of(s.offers, s.sent) },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="flex items-center justify-between gap-3 pt-10 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <div className="flex items-center gap-2">
          <PeriodSelect
            value={period}
            onChange={(p) => {
              setPeriod(p)
              setPick(null) // a node or band of the old period may not exist in the new one
            }}
          />
          <AddApplication
            onAdded={(id) => {
              // Show it: no filter hiding it (a duplicate may be older than the period), its
              // sheet open to set the rest.
              setPeriod(null)
              setGroup("all")
              setPick(null)
              setFilters({ ...NO_FILTERS, sort: filters.sort })
              setOpenId(id)
            }}
          />
        </div>
      </div>

      {list.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : list.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {list.error.message}
        </p>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-20 text-center">
          <p className="text-sm font-medium">{t.emptyTitle}</p>
          <p className="max-w-md text-sm text-pretty text-muted-foreground">{t.emptyHint}</p>
          <div className="pt-1">
            <AddApplication onAdded={setOpenId} />
          </div>
        </div>
      ) : (
        <>
          {/* One card: the key numbers sum up the flow drawn under them. */}
          <section className="overflow-hidden rounded-xl border bg-card">
            <dl className="grid grid-cols-2 sm:grid-cols-4">
              {stats.map((x, i) => (
                <div
                  key={x.label}
                  className={cn(
                    "px-6 py-4",
                    i > 0 && "sm:border-l",
                    i % 2 === 1 && "max-sm:border-l",
                    i > 1 && "max-sm:border-t",
                  )}
                >
                  <dt className="text-xs text-muted-foreground">{x.label}</dt>
                  <dd className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tight tabular-nums">{x.value}</span>
                    {x.sub && <span className="text-xs text-muted-foreground tabular-nums">{x.sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {s.sent > 0 && (
              <div className="border-t px-6 pt-4 pb-5">
                <h2 className="sr-only">{t.flowTitle}</h2>
                <FlowChart
                  apps={apps}
                  pick={pick}
                  onPick={(p) => {
                    setPick(p)
                    setGroup("all") // the pick is the filter now; a group could empty it
                  }}
                />
              </div>
            )}
          </section>

          <div className="mt-8">
            <History
              apps={apps}
              group={group}
              onGroup={setGroup}
              pick={pick}
              onClearPick={() => setPick(null)}
              openId={openId}
              onOpenId={setOpenId}
              filters={filters}
              onFilters={setFilters}
              onOpenProfile={onOpenProfile}
            />
          </div>
        </>
      )}
    </div>
  )
}
