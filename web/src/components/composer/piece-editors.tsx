import { useState } from "react"
import { GlobeIcon } from "lucide-react"

import { EditorShell } from "@/components/filters/editors"
import { PlaceSearch } from "@/components/composer/place-search"
import { ModesPicker } from "@/components/filters/include-unknown"
import { CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import type { Place, WorkMode } from "@/lib/api"
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
  return (
    <EditorShell
      title="Luogo"
      hint={initial ? `Ora: ${[initial.city, initial.region, initial.country.toUpperCase()].filter(Boolean).join(", ")}` : "Scegli una città: il paese viene da lì."}
      onCancel={onCancel}
      onRemove={onRemove}
    >
      <PlaceSearch onPick={onSave} placeholder={initial ? "Cambia città…" : "Cerca una città…"}>
        {onAnywhere && (
          <>
            <CommandSeparator className="mx-0 my-1" />
            <CommandGroup className="p-0">
              <CommandItem value="anywhere" onSelect={onAnywhere} className="cursor-pointer">
                <GlobeIcon className="text-muted-foreground" />
                Ovunque
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
  const [modes, setModes] = useState(() => splitModes(initial))
  return (
    <EditorShell
      title="Modalità di lavoro"
      hint="Basta una delle modalità scelte, insieme ai luoghi del gruppo."
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
