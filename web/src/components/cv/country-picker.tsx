import { useMemo, useState } from "react"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { countryCodes, countryName } from "@/lib/countries"
import { intlTag, useT } from "@/lib/i18n"

/** Countries, picked from every one the browser knows, named in the UI's language. */
export function CountryPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const t = useT().countries
  const locale = intlTag()
  const [open, setOpen] = useState(false)
  const all = useMemo(
    () =>
      countryCodes()
        .map((code) => ({ code, name: countryName(code, locale) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale],
  )
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((code) => (
        <span key={code} className="inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-2.5 text-xs">
          {countryName(code, locale)}
          <button
            type="button"
            aria-label={t.remove(countryName(code, locale))}
            onClick={() => toggle(code)}
            className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="xs" className="h-7 rounded-full border-dashed">
            <PlusIcon />
            {t.add}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command
            // Search by name in the UI's language, or by code ("CH").
            filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
          >
            <CommandInput placeholder={t.search} />
            <CommandList>
              <CommandEmpty>{t.none}</CommandEmpty>
              <CommandGroup>
                {all.map((c) => (
                  <CommandItem key={c.code} value={`${c.name} ${c.code}`} onSelect={() => toggle(c.code)} className="text-xs">
                    <CheckIcon className={value.includes(c.code) ? "opacity-100" : "opacity-0"} />
                    {c.name}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase">{c.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
