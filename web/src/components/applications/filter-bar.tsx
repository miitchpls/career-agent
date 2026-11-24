import { ArrowUpDownIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  filtersActive,
  NO_FILTERS,
  PERIODS,
  SCORE_BANDS,
  SORTS,
  SOURCES,
  type ListFilters,
  type Period,
  type SortKey,
} from "@/lib/application-filters"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const periodKey = (p: Period) => (p === null ? "all" : String(p)) as "7" | "30" | "90" | "365" | "all"

/** The page's period, in the header: it narrows the numbers, the chart and the list. */
export function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = useT().applications.filters
  return (
    <Select value={periodKey(value)} onValueChange={(v) => onChange(v === "all" ? null : (Number(v) as Period))}>
      <SelectTrigger size="sm" className="w-auto gap-2" aria-label={t.period}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">{t.periodHint}</div>
        {PERIODS.map((p) => (
          <SelectItem key={periodKey(p)} value={periodKey(p)}>
            {t.periods[periodKey(p)]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Search, board, score and order, in one row above the list. */
export function FilterBar({ value, onChange }: { value: ListFilters; onChange: (f: ListFilters) => void }) {
  const t = useT().applications.filters
  const set = <K extends keyof ListFilters>(k: K, v: ListFilters[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="h-8 w-full sm:w-72">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={value.q}
          onChange={(e) => set("q", e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && set("q", "")}
          placeholder={t.search}
          aria-label={t.search}
          className="text-sm"
        />
        {value.q && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label={t.clear} onClick={() => set("q", "")}>
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      <Multi
        label={t.source}
        options={SOURCES.map((s) => [s, t.sources[s]])}
        value={value.sources}
        onChange={(v) => set("sources", v as ListFilters["sources"])}
      />
      <Multi
        label={t.score}
        options={SCORE_BANDS.map((s) => [s, t.scores[s]])}
        value={value.scores}
        onChange={(v) => set("scores", v as ListFilters["scores"])}
      />
      {filtersActive(value) && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange({ ...NO_FILTERS, sort: value.sort })}>
          {t.clear}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground">
            <ArrowUpDownIcon />
            {t.sorts[value.sort]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t.sort}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value.sort} onValueChange={(v) => set("sort", v as SortKey)}>
            {SORTS.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                {t.sorts[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** A filter with several choices: the button says what's on ("Board: Indeed", "Score · 2"). */
function Multi({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: [string, string][]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const t = useT().applications.filters
  const on = options.filter(([k]) => value.includes(k))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", on.length && "border-foreground/30 bg-muted")}>
          {label}
          {on.length === 1 && <span className="font-normal text-muted-foreground">{on[0][1]}</span>}
          {on.length > 1 && <span className="rounded bg-background px-1 text-xs tabular-nums">{on.length}</span>}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map(([k, name]) => (
          <DropdownMenuCheckboxItem
            key={k}
            checked={value.includes(k)}
            // Stay open: several can be picked in a row.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => onChange(c ? [...value, k] : value.filter((x) => x !== k))}
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-muted-foreground" onSelect={() => onChange([])}>
              {t.clear}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
