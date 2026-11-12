import { useId } from "react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WORK_MODES } from "@/lib/filters"
import type { KnownMode } from "@/lib/modes"
import { cn } from "@/lib/utils"

/**
 * "Includi annunci senza …": shared by every filter whose value postings may not state
 * (work mode, salary…). On by default, since most postings leave these out.
 */
export function IncludeUnknown({
  label,
  hint = "La maggior parte degli annunci non lo indica.",
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  /** Shown but inert (e.g. no value chosen yet, so nothing can be excluded). */
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-1 transition-opacity",
        disabled && "opacity-50",
      )}
    >
      <Label htmlFor={id} className="flex-col items-start gap-0.5 text-sm font-normal">
        {label}
        <span className="text-xs text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

/** In sede / Ibrido / Remoto, plus the "include unknown" switch once a mode is picked. */
export function ModesPicker({
  known,
  includeUnknown,
  onChange,
}: {
  known: KnownMode[]
  includeUnknown: boolean
  onChange: (known: KnownMode[], includeUnknown: boolean) => void
}) {
  return (
    <div className="space-y-2">
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        spacing={0}
        value={known}
        // Clearing every mode resets the switch to its default (on), matching what's shown.
        onValueChange={(v) => onChange(v as KnownMode[], v.length ? includeUnknown : true)}
        className="w-full"
      >
        {WORK_MODES.filter((m) => m.value !== "unknown").map((m) => (
          <ToggleGroupItem key={m.value} value={m.value} className="flex-1 text-xs">
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {/* Always visible; inert (and on) until a mode is picked, since "any mode" already includes them. */}
      <IncludeUnknown
        label="Includi annunci senza modalità indicata"
        hint={
          known.length
            ? "È dedotta dal testo: molti annunci non la dichiarano."
            : "Senza modalità scelte valgono tutte, anche quelle non indicate."
        }
        checked={known.length ? includeUnknown : true}
        disabled={!known.length}
        onCheckedChange={(v) => onChange(known, v)}
      />
    </div>
  )
}
