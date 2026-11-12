import { useState, type ReactNode } from "react"
import { GlobeIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { PlaceSearch } from "@/components/composer/place-search"
import { IncludeUnknown, ModesPicker } from "@/components/filters/include-unknown"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { JobType, Place, Scope, Site } from "@/lib/api"
import { type Currency, CURRENCIES, formatAmount, parseSalary } from "@/lib/currencies"
import { POSTED, SITES } from "@/lib/filters"
import { JOB_TYPES } from "@/lib/job-types"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { joinModes, splitModes } from "@/lib/modes"
import { samePlace } from "@/lib/places"

/* ------------------------------------------------------------------ shell */

export function EditorShell({
  title,
  hint,
  children,
  onCancel,
  onApply,
  onRemove,
  canApply = true,
}: {
  title: string
  hint?: ReactNode
  children: ReactNode
  onCancel: () => void
  onApply?: () => void
  onRemove?: () => void
  canApply?: boolean
}) {
  return (
    <div
      className="flex w-[22rem] flex-col"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canApply) onApply?.()
      }}
    >
      <div className="space-y-1 px-3 pt-3 pb-2">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-3 px-3 pb-3">{children}</div>
      {(onApply || onRemove) && (
        <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2">
          {onRemove && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onRemove}>
              Rimuovi
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Annulla
            </Button>
            {onApply && (
              <Button size="sm" disabled={!canApply} onClick={onApply}>
                Applica
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Token({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border bg-muted/50 pr-0.5 pl-2 text-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Rimuovi"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

/* ------------------------------------------------------------------ scope */

export function ScopeEditor({
  initial,
  onApply,
  onCancel,
  onRemove,
}: {
  initial?: Scope
  onApply: (s: Scope) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const [anywhere, setAnywhere] = useState(initial?.anywhere ?? false)
  const [places, setPlaces] = useState<Place[]>(initial?.places ?? [])
  const [modes, setModes] = useState(() => splitModes(initial?.modes ?? []))

  const add = (p: Place) => setPlaces((list) => (list.some((x) => samePlace(x, p)) ? list : [...list, p]))

  return (
    <EditorShell
      title="Dove"
      hint="Una delle città scelte, con una delle modalità. Aggiungi altri gruppi con «oppure»."
      onApply={() => onApply({ anywhere: anywhere || places.length === 0, places: anywhere ? [] : places, modes: joinModes(modes.known, modes.includeUnknown) })}
      onCancel={onCancel}
      onRemove={onRemove}
      canApply={anywhere || places.length > 0}
    >
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label htmlFor="anywhere" className="flex items-center gap-2 text-sm font-normal">
          <GlobeIcon className="size-4 text-muted-foreground" />
          Ovunque
        </Label>
        <Switch id="anywhere" checked={anywhere} onCheckedChange={setAnywhere} />
      </div>

      {!anywhere && (
        <div className="space-y-2">
          <PlaceSearch onPick={add} />
          {places.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {places.map((p, i) => (
                <span key={`${p.geo_id ?? p.city}-${p.country}`} className="contents">
                  {i > 0 && <span className="text-[11px] text-muted-foreground">o</span>}
                  <Token onRemove={() => setPlaces(places.filter((_, j) => j !== i))}>
                    {p.city}
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{p.country}</span>
                  </Token>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Modalità di lavoro</p>
        <ModesPicker
          known={modes.known}
          includeUnknown={modes.includeUnknown}
          onChange={(known, includeUnknown) => setModes({ known, includeUnknown })}
        />
      </div>
    </EditorShell>
  )
}

/* ------------------------------------------------------------------ salary */

/** Mirrors the server's limit on `Query.salary_min` (thousands per year). */
const SALARY_MAX_K = 10_000

export function SalaryEditor({
  initial,
  includeUnknown,
  currency: initialCurrency,
  onApply,
  onCancel,
  onRemove,
}: {
  initial: number | null
  includeUnknown: boolean
  currency: Currency
  onApply: (min: number, includeUnknown: boolean, currency: Currency) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  // The full yearly amount, shown with thousands separators as it's typed ("100.000").
  const [value, setValue] = useState(initial !== null ? formatAmount(initial * 1000) : "")
  const [unknown, setUnknown] = useState(includeUnknown)
  const [currency, setCurrency] = useState<Currency>(initialCurrency)
  const amount = parseSalary(value)
  const valid = amount !== null && amount >= 1000 && amount / 1000 <= SALARY_MAX_K
  // "100" is read as 100.000: say so, so it's never a surprise.
  const readAsThousands = valid && Number(value.replace(/\D/g, "")) < 1000
  const apply = () => valid && onApply(Math.round(amount / 1000), unknown, currency)

  return (
    <EditorShell
      title="Stipendio annuo minimo"
      hint="Confrontato con il massimo della forchetta. Gli annunci in altre valute vengono convertiti al cambio BCE del giorno."
      onCancel={onCancel}
      onRemove={onRemove}
      canApply={valid}
      onApply={apply}
    >
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText className="font-mono">≥</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          inputMode="numeric"
          placeholder="100.000"
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 8)
            setValue(digits ? formatAmount(Number(digits)) : "")
          }}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="font-mono tabular-nums"
        />
        <InputGroupAddon align="inline-end" className="pr-1">
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger size="sm" aria-label="Valuta" className="h-6 border-0 bg-transparent px-1.5 font-mono text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c} className="font-mono text-xs">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InputGroupAddon>
      </InputGroup>
      {readAsThousands && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Inteso come <span className="font-mono">{formatAmount(amount)}</span> {currency}
        </p>
      )}
      <IncludeUnknown label="Includi offerte senza stipendio" checked={unknown} onCheckedChange={setUnknown} />
    </EditorShell>
  )
}

/* ------------------------------------------------------------------ job type */

export function JobTypeEditor({
  initial,
  includeUnknown: initialUnknown,
  onApply,
  onCancel,
  onRemove,
}: {
  initial: JobType[]
  includeUnknown: boolean
  onApply: (types: JobType[], includeUnknown: boolean) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const [types, setTypes] = useState(initial)
  const [unknown, setUnknown] = useState(initial.length ? initialUnknown : true)
  return (
    <EditorShell
      title="Tipo di impiego"
      hint="Basta uno dei tipi scelti. Su Indeed, con un solo tipo, la ricerca sui portali è già filtrata."
      onCancel={onCancel}
      onRemove={onRemove}
      canApply={types.length > 0}
      onApply={() => onApply(types, unknown)}
    >
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        spacing={0}
        value={types}
        // Clearing every type resets the switch to its default (on), as for work modes.
        onValueChange={(v) => {
          setTypes(v as JobType[])
          if (!v.length) setUnknown(true)
        }}
        className="grid w-full grid-cols-3 sm:flex"
      >
        {JOB_TYPES.map((t) => (
          <ToggleGroupItem key={t.value} value={t.value} className="flex-1 px-2 text-xs">
            {t.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <IncludeUnknown
        label="Includi annunci senza tipo indicato"
        hint={types.length ? "Molti annunci non lo dichiarano." : "Senza tipi scelti valgono tutti, anche quelli non indicati."}
        checked={types.length ? unknown : true}
        disabled={!types.length}
        onCheckedChange={setUnknown}
      />
    </EditorShell>
  )
}

/* ------------------------------------------------------------------ posted */

export function PostedEditor({
  initial,
  onApply,
  onCancel,
}: {
  initial: number | null
  onApply: (hours: number) => void
  onCancel: () => void
}) {
  return (
    <EditorShell title="Pubblicata entro" hint="Vale sia per la ricerca sui portali sia per la lista." onCancel={onCancel}>
      <Command className="-mx-1 w-auto bg-transparent p-0" defaultValue={String(initial ?? "")}>
        <CommandList>
          <CommandGroup className="p-0">
            {POSTED.map((p) => (
              <CommandItem
                key={p.value}
                value={String(p.value)}
                data-checked={initial === p.value}
                onSelect={() => onApply(p.value)}
                className="cursor-pointer"
              >
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </EditorShell>
  )
}

/* ------------------------------------------------------------------ sites */

export function SitesEditor({
  initial,
  onApply,
  onCancel,
  onRemove,
}: {
  initial: Site[]
  onApply: (s: Site[]) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const [sites, setSites] = useState<Site[]>(initial.length ? initial : SITES.map((s) => s.value))
  const toggle = (v: Site) => setSites(sites.includes(v) ? sites.filter((x) => x !== v) : [...sites, v])
  return (
    <EditorShell
      title="Portale"
      hint="Indeed cerca solo dentro un paese: con «Ovunque» viene saltato."
      onCancel={onCancel}
      onRemove={onRemove}
      canApply={sites.length > 0}
      onApply={() => onApply(sites)}
    >
      <Command className="-mx-1 w-auto bg-transparent p-0">
        <CommandList>
          <CommandGroup className="p-0">
            {SITES.map((s) => (
              <CommandItem
                key={s.value}
                value={s.value}
                data-checked={sites.includes(s.value)}
                onSelect={() => toggle(s.value)}
                className="cursor-pointer"
              >
                {s.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </EditorShell>
  )
}
