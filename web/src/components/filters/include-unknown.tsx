import { useId } from "react"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WORK_MODES } from "@/lib/filters"
import { useT } from "@/lib/i18n"
import type { KnownMode } from "@/lib/modes"
import { cn } from "@/lib/utils"

/**
 * "Includi annunci senza …": shared by every filter whose value postings may not state
 * (work mode, salary…). On by default, since most postings leave these out.
 */
export function IncludeUnknown({
  label,
  hint,
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
  const t = useT().editors
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-1 transition-opacity",
        disabled && "opacity-50",
      )}
    >
      <Label htmlFor={id} className="flex-col items-start gap-0.5 text-sm font-normal">
        {label}
        <span className="text-xs text-muted-foreground">{hint ?? t.unknownHint}</span>
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
  const all = useT()
  const t = all.editors
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
        {WORK_MODES.filter((m) => m !== "unknown").map((m) => (
          <ToggleGroupItem key={m} value={m} className="flex-1 text-xs">
            {all.modes[m]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {/* Always visible; inert (and on) until a mode is picked, since "any mode" already includes them. */}
      <IncludeUnknown
        label={t.unknownModes}
        hint={known.length ? t.unknownModesOn : t.unknownModesOff}
        checked={known.length ? includeUnknown : true}
        disabled={!known.length}
        onCheckedChange={(v) => onChange(known, v)}
      />
    </div>
  )
}
