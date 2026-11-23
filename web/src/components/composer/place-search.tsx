import { useState, type ReactNode } from "react"
import { Loader2Icon, MapPinIcon } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { Place } from "@/lib/api"
import { placeLabel } from "@/lib/compose"
import { useT } from "@/lib/i18n"
import { toPlace } from "@/lib/places"
import { usePlaces } from "@/lib/queries"

/**
 * City autocomplete: type "Naples" → "Napoli, Campania, Italia", "Naples, Florida, Stati Uniti"…
 * The country comes from the picked row, so there's no country selector.
 */
export function PlaceSearch({
  onPick,
  placeholder,
  autoFocus = true,
  children,
}: {
  onPick: (p: Place) => void
  placeholder?: string
  autoFocus?: boolean
  /** Extra items under the results (e.g. "Ovunque"). */
  children?: ReactNode
}) {
  const t = useT().editors
  const [text, setText] = useState("")
  const { places, loading } = usePlaces(text)
  const typed = text.trim().length >= 2

  return (
    <Command shouldFilter={false} className="-mx-1 w-auto bg-transparent p-0">
      <CommandInput autoFocus={autoFocus} value={text} onValueChange={setText} placeholder={placeholder ?? t.searchCity} />
      <CommandList className="mt-1">
        {typed && !loading && <CommandEmpty className="py-3 text-xs text-muted-foreground">{t.noCity}</CommandEmpty>}
        {typed && loading && places.length === 0 && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            {t.searchingCity}
          </div>
        )}
        {places.length > 0 && (
          <CommandGroup className="p-0">
            {places.map((o) => (
              <CommandItem
                key={o.geo_id ?? `${o.city}:${o.country}`}
                value={String(o.geo_id ?? `${o.city}:${o.country}`)}
                onSelect={() => {
                  onPick(toPlace(o))
                  setText("")
                }}
                className="cursor-pointer"
              >
                <MapPinIcon className="text-muted-foreground" />
                <span className="truncate">{placeLabel(o)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {children}
      </CommandList>
    </Command>
  )
}
