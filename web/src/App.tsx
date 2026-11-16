import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon, MoonIcon, MoreHorizontalIcon, SunIcon, Trash2Icon } from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { AnimatePresence, motion, type Transition } from "motion/react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Composer } from "@/components/composer/composer"
import { ProfileButton } from "@/components/profile/profile-button"
import { ProfilePage } from "@/components/profile/profile-page"
import { JobSheet } from "@/components/jobs/job-sheet"
import { JobsTable } from "@/components/jobs/jobs-table"
import { RunProgress } from "@/components/run/run-progress"
import { StartSearchButton } from "@/components/run/start-search"
import { useStartSearch } from "@/lib/use-start-search"
import { SaveSearchButton, SavedSearchesMenu } from "@/components/saved/saved-searches"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, type Job, type SavedSearch } from "@/lib/api"
import { CLEARED, activeCount, fromQuery, toQuery, useFilters, type FilterState } from "@/lib/filters"
import { useJobs, useRunStatus } from "@/lib/queries"
import { cn } from "@/lib/utils"

const SPRING: Transition = { type: "spring", stiffness: 260, damping: 32, mass: 0.9 }
const hasQuery = (f: FilterState) => activeCount(f) > 0 || !!f.q

/** Compass needle: full "north" half, faded "south" half, tilted towards the top right. */
function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <g transform="rotate(45 12 12)" fill="currentColor">
        <path d="M12 1.8 15.6 12H8.4Z" />
        <path d="M8.4 12h7.2L12 22.2Z" opacity=".32" />
      </g>
    </svg>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Cambia tema" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

function Results({
  filters,
  onOpen,
  onClearFilters,
}: {
  filters: FilterState
  onOpen: (j: Job) => void
  onClearFilters: () => void
}) {
  const [, setFilters] = useFilters()
  const query = useMemo(() => toQuery(filters), [filters])
  const jobs = useJobs(query, filters.sort, filters.dir)
  const running = !!useRunStatus().data?.running
  const pages = jobs.data?.pages ?? []
  // Pages share one snapshot, but dedupe anyway: row keys must be unique for the animations.
  const items = [...new Map(pages.flatMap((p) => p.items).map((j) => [j.url, j])).values()]
  const first = pages[0]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium">Offerte</h2>
        {first && (
          <motion.span
            key={`${first.total}/${first.overall}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {first.total === first.overall ? first.overall : `${first.total} di ${first.overall}`}
          </motion.span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Saving and fetching live here, not in the composer: the bar only filters what's saved. */}
          <StartSearchButton query={query} running={running} />
          <SaveSearchButton query={query} disabled={activeCount(filters) === 0} />
        </div>
      </div>

      <RunProgress />

      {jobs.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          Impossibile caricare le offerte: {jobs.error.message}
          <Button variant="outline" size="xs" className="ml-auto" onClick={() => jobs.refetch()}>
            Riprova
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <JobsTable
          jobs={items}
          loading={jobs.isPending}
          overall={first?.overall ?? 0}
          onOpen={onOpen}
          onClearFilters={onClearFilters}
          sort={filters.sort}
          direction={filters.dir}
          // First click sorts descending (newest / highest); clicking the active column flips it.
          onSort={(sort) =>
            setFilters(sort === filters.sort ? { dir: filters.dir === "desc" ? "asc" : "desc" } : { sort, dir: null })
          }
          searching={running}
          searchAction={<StartSearchButton query={query} running={running} label="Cerca sui portali" prominent />}
        />
        {first && items.length > 0 && jobs.hasNextPage && (
          <div className="flex justify-center border-t px-4 py-2.5">
            <Button variant="outline" size="sm" onClick={() => jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage}>
              Mostra altre
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useFilters()
  const query = useMemo(() => toQuery(filters), [filters])
  const { data: status } = useRunStatus()
  const [open, setOpen] = useState<Job | null>(null)
  // Results show only after the user runs the query; a shared link with filters opens straight on them.
  const [submitted, setSubmitted] = useState(() => hasQuery(filters))
  const qc = useQueryClient()
  // The profile is a separate page in the URL (?view=profilo), so back and forward work.
  const [view, setView] = useQueryState("view", parseAsStringLiteral(["profilo"] as const).withOptions({ history: "push" }))
  const openProfile = () => {
    setOpen(null)
    setView("profilo")
    window.scrollTo({ top: 0 })
  }

  // Emptying the query sends the bar back to the middle of the page
  // (state adjusted during render, React's pattern for "reset state when a value changes").
  const empty = !hasQuery(filters)
  const [wasEmpty, setWasEmpty] = useState(empty)
  if (empty !== wasEmpty) {
    setWasEmpty(empty)
    if (empty) setSubmitted(false)
  }

  const clear = useMutation({
    mutationFn: api.clear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] })
      toast("Cache svuotata", { description: "La prossima ricerca interrogherà di nuovo i portali." })
    },
    onError: (e) => toast.error(e.message),
  })

  const runSaved = useStartSearch(() => setSubmitted(true))

  const loadSaved = (s: SavedSearch) => {
    setView(null)
    setFilters({ ...fromQuery(s.query), sort: filters.sort, dir: filters.dir })
    setSubmitted(true)
  }
  const goHome = () => {
    setView(null)
    setFilters({ ...CLEARED, q: null })
    setSubmitted(false)
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header
        className={cn(
          "sticky top-0 z-20 border-b border-transparent bg-background/80 backdrop-blur transition-colors duration-500",
          (submitted || view) && "border-border",
        )}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <button type="button" onClick={goHome} className="flex items-center gap-2" aria-label="Home">
            <Logo />
            <span className="text-sm font-medium">career-agent</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <SavedSearchesMenu
              current={query}
              running={!!status?.running}
              onLoad={loadSaved}
              onRun={(s) => {
                loadSaved(s)
                runSaved.mutate({ saved: s })
              }}
            />
            <ProfileButton active={view === "profilo"} onClick={openProfile} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Altre azioni">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  disabled={status?.running}
                  onSelect={() => {
                    if (
                      confirm(
                        "Svuotare la cache?\n\nVengono eliminate tutte le offerte scaricate dai portali e la prossima ricerca li interrogherà di nuovo. Le ricerche salvate restano.",
                      )
                    )
                      clear.mutate()
                  }}
                >
                  <Trash2Icon />
                  Svuota cache
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {view === "profilo" ? (
        <main className="flex-1">
          <ProfilePage onBack={() => setView(null)} />
        </main>
      ) : (
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16">
        {/* The spacer jumps between heights; the bar glides between them via a layout animation. */}
        {/* min-h leaves room for the hero text, which sits above the bar without taking layout space. */}
        <div className={submitted ? "h-8" : "h-[calc(33svh-3.5rem-3.75rem)] min-h-36"} />
        <motion.div layout="position" transition={SPRING} className="relative z-10 mx-auto w-full max-w-3xl">
          <AnimatePresence>
            {!submitted && (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.1 } }}
                exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
                className="pointer-events-none absolute inset-x-0 bottom-full mb-8 space-y-2 text-center"
              >
                <h1 className="text-3xl font-semibold tracking-tight text-balance">Che lavoro cerchi?</h1>
                <p className="text-sm text-muted-foreground text-balance">
                  Descrivi il lavoro che vuoi: ruolo, dove, come e da quanto. Al resto pensiamo noi.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <Composer
            autoFocus={!submitted}
            onSubmit={() => setSubmitted(true)}
          />
        </motion.div>

        <AnimatePresence>
          {submitted && (
            <motion.section
              key="results"
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: 0.15 } }}
              exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
              className="mt-10"
            >
              <Results filters={filters} onOpen={setOpen} onClearFilters={goHome} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      )}

      <JobSheet job={open} onClose={() => setOpen(null)} onOpenProfile={openProfile} />
    </div>
  )
}
