import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircleIcon, MoreHorizontalIcon, Settings2Icon } from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { AnimatePresence, motion, type Transition } from "motion/react"

import { Composer } from "@/components/composer/composer"
import { MainNav } from "@/components/profile/main-nav"
import { ProfilePage } from "@/components/profile/profile-page"
import { JobSheet, type PendingJob } from "@/components/jobs/job-sheet"
import { OpenLink } from "@/components/jobs/open-link"
import { JobsTable } from "@/components/jobs/jobs-table"
import { RunProgress } from "@/components/run/run-progress"
import { PreferencesDialog } from "@/components/settings/preferences-dialog"
import { StartSearchButton } from "@/components/run/start-search"
import { useStartSearch } from "@/lib/use-start-search"
import { SaveSearchButton, SavedSearchShelf, SavedSearchesMenu } from "@/components/saved/saved-searches"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useQueryClient } from "@tanstack/react-query"
import { api, type Job, type PastedPosting, type SavedSearch } from "@/lib/api"
import type { LinkSite } from "@/lib/job-link"
import { CLEARED, activeCount, fromQuery, toQuery, useFilters, type FilterState } from "@/lib/filters"
import { useJobs, useRunStatus } from "@/lib/queries"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { MOD_KEY } from "@/lib/platform"
import { openPreferences, setPreferencesOpen, usePreferencesOpen } from "@/lib/preferences"

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

function Results({
  filters,
  onOpen,
  onClearFilters,
  onLoadSaved,
  onRunSaved,
}: {
  filters: FilterState
  onOpen: (j: Job) => void
  onClearFilters: () => void
  onLoadSaved: (s: SavedSearch) => void
  onRunSaved: (s: SavedSearch) => void
}) {
  const all = useT()
  const t = all.app
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
        <h2 className="text-sm font-medium">{t.jobs}</h2>
        {first && (
          <motion.span
            key={`${first.total}/${first.overall}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {first.total === first.overall ? first.overall : t.of(first.total, first.overall)}
          </motion.span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Saving and fetching live here, not in the composer: the bar only filters what's saved. */}
          <StartSearchButton query={query} running={running} />
          {/* Saving and loading live side by side: the bookmark pair of the results. */}
          <SavedSearchesMenu current={query} running={running} onLoad={onLoadSaved} onRun={onRunSaved} />
          <SaveSearchButton query={query} disabled={activeCount(filters) === 0} />
        </div>
      </div>

      <RunProgress />

      {jobs.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          {t.loadError(jobs.error.message)}
          <Button variant="outline" size="xs" className="ml-auto" onClick={() => jobs.refetch()}>
            {all.common.retry}
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
          searchAction={<StartSearchButton query={query} running={running} label={t.searchPortals} prominent />}
        />
        {first && items.length > 0 && jobs.hasNextPage && (
          <div className="flex justify-center border-t px-4 py-2.5">
            <Button variant="outline" size="sm" onClick={() => jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage}>
              {t.showMore}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  // Every component below re-renders on a language change, so plain `msgs()` calls stay current.
  const t = useT().app
  const [filters, setFilters] = useFilters()
  const query = useMemo(() => toQuery(filters), [filters])
  const { data: status } = useRunStatus()
  const [open, setOpen] = useState<Job | null>(null)
  const [pending, setPending] = useState<PendingJob | null>(null)
  const client = useQueryClient()
  // Only the latest link may fill the sheet: closing it, or pasting another, drops a late answer.
  const linkRun = useRef(0)
  const closeSheet = () => {
    linkRun.current++
    setOpen(null)
    setPending(null)
  }
  const openJob = (job: Job) => {
    linkRun.current++
    setPending(null)
    setOpen(job)
  }
  const openLink = async (url: string, site: LinkSite) => {
    const run = ++linkRun.current
    setOpen(null)
    setPending({ url, site, error: null })
    try {
      const { job, known } = await api.openLink(url, filters.cur)
      if (run !== linkRun.current) return
      if (!known) void client.invalidateQueries({ queryKey: ["jobs"] })
      setPending(null)
      setOpen(job)
    } catch (e) {
      if (run === linkRun.current) setPending({ url, site, error: (e as Error).message })
    }
  }
  // The board wouldn't show the posting (or its text): the user pasted it. Errors stay in the form.
  const pasteJob = async (url: string, posting: PastedPosting) => {
    const run = linkRun.current
    const { job, known } = await api.pasteJob(url, posting, filters.cur)
    if (run !== linkRun.current) return
    if (!known) {
      void client.invalidateQueries({ queryKey: ["jobs"] })
      // The pasted text may fill the work mode or the place the checks read.
      void client.invalidateQueries({ queryKey: ["job-match", url] })
    }
    setPending(null)
    setOpen(job)
  }
  // Results show only after the user runs the query; a shared link with filters opens straight on them.
  const [submitted, setSubmitted] = useState(() => hasQuery(filters))
  // The profile is a separate page in the URL (?view=profilo), so back and forward work.
  const [view, setView] = useQueryState("view", parseAsStringLiteral(["profilo"] as const).withOptions({ history: "push" }))
  const openProfile = () => {
    closeSheet()
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

  const prefs = usePreferencesOpen()
  // ⌘, / Ctrl+, opens the preferences, as in most desktop apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openPreferences()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const runSaved = useStartSearch(() => setSubmitted(true))

  const loadSaved = (s: SavedSearch) => {
    setView(null)
    setFilters({ ...fromQuery(s.query), sort: filters.sort, dir: filters.dir })
    setSubmitted(true)
  }
  const runSavedSearch = (s: SavedSearch) => {
    loadSaved(s)
    runSaved.mutate({ saved: s })
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
          <button type="button" onClick={goHome} className="flex items-center gap-2" aria-label={t.home}>
            <Logo />
            <span className="text-sm font-medium">career-agent</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <MainNav view={view ?? "offerte"} onChange={(v) => (v === "profilo" ? openProfile() : setView(null))} />
            <span className="mx-2 h-5 w-px bg-border" aria-hidden />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t.more}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem onSelect={openPreferences}>
                  <Settings2Icon />
                  {t.preferences}
                  {/* On the highlighted item the caps' muted fill matches the item's own: tint them. */}
                  <KbdGroup className="ml-auto *:group-focus/dropdown-menu-item:bg-foreground/10">
                    <Kbd>{MOD_KEY}</Kbd>
                    <Kbd>,</Kbd>
                  </KbdGroup>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PreferencesDialog open={prefs} onOpenChange={setPreferencesOpen} />
          </div>
        </div>
      </header>

      {view === "profilo" ? (
        <main className="flex-1">
          <ProfilePage />
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
                <h1 className="text-3xl font-semibold tracking-tight text-balance">{t.heroTitle}</h1>
                <p className="text-sm text-muted-foreground text-balance">
                  {t.heroText}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <Composer
            autoFocus={!submitted}
            onSubmit={() => setSubmitted(true)}
          />
          <AnimatePresence>
            {!submitted && (
              <motion.div
                key="link"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.25 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                <OpenLink busy={!!pending && !pending.error} onOpen={openLink} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!submitted && (
              <motion.div
                key="shelf"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.2 } }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                className="absolute inset-x-0 top-full mt-10"
              >
                <SavedSearchShelf current={query} running={!!status?.running} onLoad={loadSaved} onRun={runSavedSearch} />
              </motion.div>
            )}
          </AnimatePresence>
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
              <Results
                filters={filters}
                onOpen={openJob}
                onClearFilters={goHome}
                onLoadSaved={loadSaved}
                onRunSaved={runSavedSearch}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      )}

      <JobSheet
        job={open}
        pending={pending}
        query={submitted && !view ? query : null}
        onClose={closeSheet}
        onPaste={pasteJob}
        onOpenProfile={openProfile}
      />
    </div>
  )
}
