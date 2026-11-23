import { useState } from "react"
import { GlobeIcon } from "lucide-react"

import { EditorShell } from "@/components/filters/editors"
import { PlaceSearch } from "@/components/composer/place-search"
import { ModesPicker } from "@/components/filters/include-unknown"
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import type { Place, WorkMode } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { joinModes, splitModes } from "@/lib/modes"

export function PhraseEditor({
  title,
  hint,
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  title: string
  hint?: string
  initial: string
  onSave: (v: string) => void
  onRemove: () => void
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  const ok = v.trim().length > 0
  return (
    <EditorShell title={title} hint={hint} onCancel={onCancel} onRemove={onRemove} canApply={ok} onApply={() => onSave(v.trim())}>
      <Input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ok && onSave(v.trim())}
      />
    </EditorShell>
  )
}

/** Change one place via autocomplete (the country comes from the picked city), or switch to "anywhere". */
export function PlaceEditor({
  initial,
  onSave,
  onAnywhere,
  onRemove,
  onCancel,
}: {
  initial: Place | null
  onSave: (p: Place) => void
  onAnywhere?: () => void
  onRemove: () => void
  onCancel: () => void
}) {
  const all = useT()
  const t = all.editors
  return (
    <EditorShell
      title={t.place}
      hint={initial ? t.placeNow([initial.city, initial.region, initial.country.toUpperCase()].filter(Boolean).join(", ")) : t.placeHint}
      onCancel={onCancel}
      onRemove={onRemove}
    >
      <PlaceSearch onPick={onSave} placeholder={initial ? t.changeCity : t.searchCity}>
        {onAnywhere && (
          <>
            <CommandSeparator className="mx-0 my-1" />
            <CommandGroup className="p-0">
              <CommandItem value="anywhere" onSelect={onAnywhere} className="cursor-pointer">
                <GlobeIcon className="text-muted-foreground" />
                {all.common.anywhere}
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </PlaceSearch>
    </EditorShell>
  )
}

export function ModesEditor({
  initial,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: WorkMode[]
  onSave: (m: WorkMode[]) => void
  onRemove: () => void
  onCancel: () => void
}) {
  const t = useT().editors
  const [modes, setModes] = useState(() => splitModes(initial))
  return (
    <EditorShell
      title={t.modes}
      hint={t.modesHint}
      onCancel={onCancel}
      onRemove={onRemove}
      canApply={modes.known.length > 0}
      onApply={() => onSave(joinModes(modes.known, modes.includeUnknown))}
    >
      <ModesPicker
        known={modes.known}
        includeUnknown={modes.includeUnknown}
        onChange={(known, includeUnknown) => setModes({ known, includeUnknown })}
      />
    </EditorShell>
  )
}
