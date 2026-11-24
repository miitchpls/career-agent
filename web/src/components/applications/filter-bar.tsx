import { ArrowUpDownIcon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PERIODS, SORTS, type Period, type SortKey } from "@/lib/application-filters"
import { useT } from "@/lib/i18n"

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

/** The list's search: position, company or place. */
export function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const t = useT().applications.filters
  return (
    <InputGroup className="h-8 w-full sm:w-64">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={t.search}
        aria-label={t.search}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={t.clear} onClick={() => onChange("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export function SortMenu({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  const t = useT().applications.filters
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${t.sort}: ${t.sorts[value]}`}>
          <ArrowUpDownIcon />
          {t.sorts[value]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t.sort}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as SortKey)}>
          {SORTS.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {t.sorts[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Something narrowing the list, said in full and removable: the chart's pick. */
export function Chip({
  children,
  onRemove,
  label,
}: {
  children: React.ReactNode
  onRemove: () => void
  label: string
}) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-muted/60 pr-0.5 pl-2.5 text-sm">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    </span>
  )
}
