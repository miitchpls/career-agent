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
import { useSaved } from "@/lib/queries"

/* ------------------------------------------------------------------ save */

export function SaveSearchButton({ query, disabled }: { query: Query; disabled: boolean }) {
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
      toast(r.created ? "Ricerca salvata" : "Ricerca aggiornata", { description: r.name })
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
          title={current ? `Salvata come «${current.name}»: clicca per rinominarla o aggiornarla` : undefined}
        >
          {current ? <BookmarkIcon className="fill-current" /> : <BookmarkPlusIcon />}
          {current ? "Salvata" : "Salva ricerca"}
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
            <p className="text-sm font-medium">Salva ricerca</p>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
            <p className="text-xs text-muted-foreground">
              {clash ? `Esiste già: «${clash.name}» verrà aggiornata con questa query.` : "Salva i filtri attuali per ritrovarli ed eseguirli con un clic."}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t bg-muted/40 px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || save.isPending}>
              {clash ? "Aggiorna" : "Salva"}
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
}: {
  current: Query
  onLoad: (s: SavedSearch) => void
  onRun: (s: SavedSearch) => void
  running: boolean
}) {
  const { data: saved = [] } = useSaved()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const remove = useMutation({
    mutationFn: (s: SavedSearch) => api.saved.remove(s.id),
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: ["saved"] })
      toast("Ricerca eliminata", { description: s.name })
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
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <BookmarkIcon />
          Salvate
          {saved.length > 0 && <span className="font-mono text-[11px] tabular-nums">{saved.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <Command>
          <CommandInput placeholder="Cerca tra le ricerche salvate…" />
          <CommandList className="max-h-96">
            <CommandEmpty className="px-4 text-muted-foreground">
              {saved.length ? "Nessuna corrispondenza." : "Nessuna ricerca salvata. Componi una query e premi il segnalibro."}
            </CommandEmpty>
            {saved.length > 0 && (
              <CommandGroup heading="Ricerche salvate">
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
                          {active && <span className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground">attiva</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{querySummary(s.query)}</div>
                        <div className="text-[11px] text-muted-foreground/70">
                          {s.last_run_at ? `Eseguita ${relativeDay(s.last_run_at)}` : "Mai eseguita"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 self-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Elimina ${s.name}`}
                              className="text-muted-foreground opacity-0 group-hover/saved:opacity-100 group-data-[selected=true]/saved:opacity-100 hover:text-destructive"
                              onPointerDown={act(() => {})}
                              onClick={act(() => confirm(`Eliminare «${s.name}»?`) && remove.mutate(s))}
                            >
                              <Trash2Icon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Elimina</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Esegui ${s.name}`}
                              disabled={running}
                              onPointerDown={act(() => {})}
                              onClick={act(() => {
                                setOpen(false)
                                onRun(s)
                              })}
                            >
                              <PlayIcon />
                              Esegui
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Avvia subito la ricerca sui portali</TooltipContent>
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
