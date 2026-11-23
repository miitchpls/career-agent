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
import { type Currency, CURRENCIES, formatAmount, parseSalary, salaryRangeK } from "@/lib/currencies"
import { POSTED, SITES } from "@/lib/filters"
import { JOB_TYPES } from "@/lib/job-types"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { joinModes, splitModes } from "@/lib/modes"
import { useT } from "@/lib/i18n"
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
  const t = useT().common
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
              {t.remove}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t.cancel}
            </Button>
            {onApply && (
              <Button size="sm" disabled={!canApply} onClick={onApply}>
                {t.apply}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Token({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  const t = useT().common
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border bg-muted/50 pr-0.5 pl-2 text-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t.remove}
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

  const all = useT()
  const t = all.editors
  const add = (p: Place) => setPlaces((list) => (list.some((x) => samePlace(x, p)) ? list : [...list, p]))

  return (
    <EditorShell
      title={t.where}
      hint={t.whereHint}
      onApply={() => onApply({ anywhere: anywhere || places.length === 0, places: anywhere ? [] : places, modes: joinModes(modes.known, modes.includeUnknown) })}
      onCancel={onCancel}
      onRemove={onRemove}
      canApply={anywhere || places.length > 0}
    >
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label htmlFor="anywhere" className="flex items-center gap-2 text-sm font-normal">
          <GlobeIcon className="size-4 text-muted-foreground" />
          {all.common.anywhere}
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
                  {i > 0 && <span className="text-[11px] text-muted-foreground">{all.common.or}</span>}
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
        <p className="text-xs font-medium text-muted-foreground">{t.modes}</p>
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
  const t = useT().editors
  // The full yearly amount, shown with thousands separators as it's typed ("100.000").
  const [value, setValue] = useState(initial !== null ? formatAmount(initial * 1000) : "")
  const [unknown, setUnknown] = useState(includeUnknown)
  const [currency, setCurrency] = useState<Currency>(initialCurrency)
  const amount = parseSalary(value, currency)
  const [lo, hi] = salaryRangeK(currency)
  const valid = amount !== null && amount / 1000 >= lo && amount / 1000 <= hi
  // "100" is read as 100.000, and "6000" won as 6000만: say so, so it's never a surprise.
  const reread = valid && amount !== Number(value.replace(/\D/g, ""))
  const apply = () => valid && onApply(Math.round(amount / 1000), unknown, currency)

  return (
    <EditorShell
      title={t.salary}
      hint={t.salaryHint}
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
            const digits = e.target.value.replace(/\D/g, "").slice(0, 11) // up to billions: won
            setValue(digits ? formatAmount(Number(digits)) : "")
          }}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="font-mono tabular-nums"
        />
        <InputGroupAddon align="inline-end" className="pr-1">
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <SelectTrigger size="sm" aria-label={t.currency} className="h-6 border-0 bg-transparent px-1.5 font-mono text-xs shadow-none">
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
      {reread && (
        <p className="-mt-1 text-xs text-muted-foreground">
          {t.readAs} <span className="font-mono">{formatAmount(amount, currency)}</span> {currency}
        </p>
      )}
      <IncludeUnknown label={t.unknownSalary} checked={unknown} onCheckedChange={setUnknown} />
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
  const all = useT()
  const t = all.editors
  const [types, setTypes] = useState(initial)
  const [unknown, setUnknown] = useState(initial.length ? initialUnknown : true)
  return (
    <EditorShell
      title={t.jobType}
      hint={t.jobTypeHint}
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
        {JOB_TYPES.map((jt) => (
          <ToggleGroupItem key={jt.value} value={jt.value} className="flex-1 px-2 text-xs">
            {all.jobTypes[jt.value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <IncludeUnknown
        label={t.unknownTypes}
        hint={types.length ? t.unknownTypesOn : t.unknownTypesOff}
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
  const all = useT()
  return (
    <EditorShell title={all.editors.posted} hint={all.editors.postedHint} onCancel={onCancel}>
      <Command className="-mx-1 w-auto bg-transparent p-0" defaultValue={String(initial ?? "")}>
        <CommandList>
          <CommandGroup className="p-0">
            {POSTED.map((h) => (
              <CommandItem
                key={h}
                value={String(h)}
                data-checked={initial === h}
                onSelect={() => onApply(h)}
                className="cursor-pointer"
              >
                {all.posted[h]}
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
  const t = useT().editors
  const toggle = (v: Site) => setSites(sites.includes(v) ? sites.filter((x) => x !== v) : [...sites, v])
  return (
    <EditorShell
      title={t.site}
      hint={t.siteHint}
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
