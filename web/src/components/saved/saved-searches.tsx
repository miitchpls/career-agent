import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BookmarkIcon, BookmarkPlusIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type Query, type SavedSearch } from "@/lib/api"
import { sameQuery } from "@/lib/filters"
import { querySummary, relativeDay } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { useSaved } from "@/lib/queries"

/* ------------------------------------------------------------------ save */

export function SaveSearchButton({ query, disabled }: { query: Query; disabled: boolean }) {
  const all = useT()
  const t = all.saved
  const { data: saved = [] } = useSaved()
  const current = saved.find((s) => sameQuery(s.query, query))
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const qc = useQueryClient()
  const clash = saved.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())

  const save = useMutation({
    mutationFn: () => api.saved.save(name.trim(), query),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["saved"] })
      setOpen(false)
      toast(r.created ? t.saved : t.updated, { description: r.name })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setName(current?.name ?? querySummary(query))
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={current ? t.savedAs(current.name) : undefined}
        >
          {current ? <BookmarkIcon className="fill-current" /> : <BookmarkPlusIcon />}
          {current ? t.isSaved : t.save}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" onKeyDown={(e) => e.stopPropagation()}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) save.mutate()
          }}
        >
          <div className="space-y-2 p-3">
            <p className="text-sm font-medium">{t.save}</p>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} />
            <p className="text-xs text-muted-foreground">
              {clash ? t.clash(clash.name) : t.saveHint}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t bg-muted/40 px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {all.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || save.isPending}>
              {clash ? t.update : all.common.save}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ list */

export function SavedSearchesMenu({
  current,
  onLoad,
  onRun,
  running,
  children,
}: {
  current: Query
  onLoad: (s: SavedSearch) => void
  onRun: (s: SavedSearch) => void
  running: boolean
  /** Custom trigger; defaults to the toolbar button. */
  children?: React.ReactNode
}) {
  const all = useT()
  const t = all.saved
  const { data: saved = [] } = useSaved()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const remove = useMutation({
    mutationFn: (s: SavedSearch) => api.saved.remove(s.id),
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ["saved"] })
      toast(t.deleted, { description: s.name })
    },
    onError: (e) => toast.error(e.message),
  })

  const act = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm" disabled={saved.length === 0}>
            <BookmarkIcon />
            {t.menu}
            {saved.length > 0 && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{saved.length}</span>}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <Command>
          <CommandInput placeholder={t.filter} />
          <CommandList className="max-h-96">
            <CommandEmpty className="px-4 text-muted-foreground">
              {saved.length ? t.noMatch : t.none}
            </CommandEmpty>
            {saved.length > 0 && (
              <CommandGroup heading={t.heading}>
                {saved.map((s) => {
                  const active = sameQuery(s.query, current)
                  return (
                    <CommandItem
                      key={s.id}
                      value={`${s.name} ${querySummary(s.query)}`}
                      data-checked={active}
                      onSelect={() => {
                        onLoad(s)
                        setOpen(false)
                      }}
                      className="group/saved cursor-pointer items-start gap-3 py-2 [&>svg:last-child]:hidden"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{s.name}</span>
                          {active && <span className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground">{t.active}</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{querySummary(s.query)}</div>
                        <div className="text-[11px] text-muted-foreground/70">
                          {s.last_run_at ? t.ran(relativeDay(s.last_run_at)) : t.neverRan}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 self-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t.deleteNamed(s.name)}
                              className="text-muted-foreground opacity-0 group-hover/saved:opacity-100 group-data-[selected=true]/saved:opacity-100 hover:text-destructive"
                              onPointerDown={act(() => {})}
                              onClick={act(() => confirm(t.confirmDelete(s.name)) && remove.mutate(s))}
                            >
                              <Trash2Icon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{all.common.delete}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={t.runNamed(s.name)}
                              disabled={running}
                              onPointerDown={act(() => {})}
                              onClick={act(() => {
                                setOpen(false)
                                onRun(s)
                              })}
                            >
                              <PlayIcon />
                              {t.run}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t.runHint}</TooltipContent>
                        </Tooltip>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ shelf */

const SHELF = 4

/**
 * Saved searches on the empty home, under the composer: the moment you open the app
 * is when you want to rerun one. The full list opens from "Tutte".
 */
export function SavedSearchShelf({
  current,
  onLoad,
  onRun,
  running,
}: {
  current: Query
  onLoad: (s: SavedSearch) => void
  onRun: (s: SavedSearch) => void
  running: boolean
}) {
  const t = useT().saved
  const { data: saved = [] } = useSaved()
  if (saved.length === 0) return null
  const recent = [...saved]
    .sort((a, b) => (b.last_run_at ?? "").localeCompare(a.last_run_at ?? ""))
    .slice(0, SHELF)

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium text-muted-foreground">{t.heading}</p>
        {saved.length > SHELF && (
          <SavedSearchesMenu current={current} onLoad={onLoad} onRun={onRun} running={running}>
            <Button variant="link" size="xs" className="h-auto px-0 text-xs text-muted-foreground">
              {t.all(saved.length)}
            </Button>
          </SavedSearchesMenu>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {recent.map((s) => (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => onLoad(s)}
            onKeyDown={(e) => e.key === "Enter" && onLoad(s)}
            className="group/shelf flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BookmarkIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={querySummary(s.query)}>
                {s.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {s.last_run_at ? t.ran(relativeDay(s.last_run_at)) : t.neverRan}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.runNamed(s.name)}
                  disabled={running}
                  className="opacity-0 transition-opacity group-hover/shelf:opacity-100 group-focus-visible/shelf:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRun(s)
                  }}
                >
                  <PlayIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t.runHint}</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  )
}
