import { useState } from "react"
import { ChevronDownIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CV_LANGUAGES, CV_TEMPLATES, LOCKED_SECTIONS, type CvOverrides, type Job } from "@/lib/api"
import { footerApplies, jobCountry, resolveCv, useCvPrefs } from "@/lib/cv-prefs"
import { intlTag, languageName, useT } from "@/lib/i18n"
import { useProfile } from "@/lib/profile"
import { NO_OVERRIDES, overrideCount, useCvSettings, useSaveCvSettings } from "@/lib/tailored-cv"
import { cn } from "@/lib/utils"

type Choice = "language" | "format" | "style" | "photo"

/**
 * The choices of each CV setting, labelled; "auto" ones say what they come to for `job` when
 * given ("The posting's (English)").
 */
export function useCvChoices(job?: Pick<Job, "location" | "description">) {
  const all = useT()
  const t = all.profileView
  const prefs = useCvPrefs()
  const { profile } = useProfile()
  // What "auto" resolves to here, whatever the other settings.
  const auto = job ? resolveCv({ ...prefs, language: "job", format: "auto", photo: "auto" }, job, true) : null
  const yes = (on: boolean) => (on ? all.cv.settings.yes : all.cv.settings.no)
  const withAuto = (label: string, value: string | null) => (value ? `${label} (${value})` : label)
  return {
    language: [
      ["job", withAuto(t.languageJob, auto && languageName(auto.language).toLocaleLowerCase(intlTag()))],
      ...CV_LANGUAGES.map((l): [string, string] => [l, languageName(l)]),
    ],
    format: [
      ["auto", withAuto(t.formatAuto, auto && (auto.format === "a4" ? "A4" : "Letter"))],
      ["a4", "A4"],
      ["letter", "Letter"],
    ],
    style: CV_TEMPLATES.map((id) => [id, all.cv.templates[id].name]),
    photo: [
      ["auto", withAuto(t.photoAuto, auto && profile.photo ? yes(auto.photo) : null)],
      ["always", t.photoAlways],
      ["never", t.photoNever],
    ],
  } satisfies Record<Choice, [string, string][]>
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * One posting's CV settings, in a popover from the CV tab: each one changed here applies to
 * this posting only; the defaults stay as they are on the profile page.
 */
export function CvSettings({
  job,
  trigger,
  onOpenDefaults,
}: {
  job: Pick<Job, "url" | "location" | "description">
  trigger: React.ReactNode
  onOpenDefaults: () => void
}) {
  const all = useT()
  const t = all.cv.settings
  const pv = all.profileView
  const defaults = useCvPrefs()
  const overrides = useCvSettings(job.url)
  const save = useSaveCvSettings(job.url)
  const choices = useCvChoices(job)
  const set = (patch: Partial<CvOverrides>) => save.mutate({ ...overrides, ...patch })
  const [notes, setNotes] = useState(overrides.notes)
  const [open, setOpen] = useState(false)
  const saveNotes = () => {
    if (notes.trim() !== overrides.notes) set({ notes: notes.trim() })
  }
  const n = overrideCount(overrides)
  const locked = overrides.locked ?? defaults.locked

  const row = (key: Choice, label: string) => {
    const value = overrides[key] ?? defaults[key]
    const options = choices[key]
    const name = (v: string) => options.find(([id]) => id === v)?.[1] ?? v
    return (
      <SettingRow
        key={key}
        label={label}
        changed={overrides[key] !== null}
        resetLabel={t.resetOne(name(defaults[key]))}
        onReset={() => set({ [key]: null })}
      >
        <Select
          value={value}
          // Picking the default's value is the default: nothing left to override.
          onValueChange={(v) => set({ [key]: v === defaults[key] ? null : v })}
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {options.map(([v, l]) => (
              <SelectItem key={v} value={v} className="text-xs">
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // Closing saves the notes (Escape never blurs the field); reopening shows what's saved.
        if (o) setNotes(overrides.notes)
        else saveNotes()
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[23rem] gap-0 p-0">
        <div className="space-y-1 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{t.title}</h3>
            {n > 0 && (
              <span className="rounded-full bg-foreground px-1.5 text-[10px] font-medium text-background tabular-nums">
                {n}
              </span>
            )}
          </div>
          <p className="text-xs text-pretty text-muted-foreground">{t.hint}</p>
        </div>

        <div className="space-y-2 px-4 py-3">
          {row("language", pv.language)}
          {row("format", pv.format)}
          {row("style", pv.style)}
          {row("photo", pv.photo)}
          <FooterRow job={job} overrides={overrides} onChange={(footer) => set({ footer })} />
          <SettingRow
            label={pv.locked}
            changed={overrides.locked !== null}
            resetLabel={t.resetOne(defaults.locked.length ? pv.lockedSome(defaults.locked.length) : pv.lockedNone)}
            onReset={() => set({ locked: null })}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 w-full justify-between px-2.5 text-xs font-normal">
                  <span className="truncate">{locked.length ? locked.map((s) => pv.sections[s]).join(", ") : pv.lockedNone}</span>
                  <ChevronDownIcon className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {LOCKED_SECTIONS.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    className="text-xs"
                    checked={locked.includes(s)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) => {
                      const next = on ? [...locked, s] : locked.filter((x) => x !== s)
                      set({ locked: sameList(next, defaults.locked) ? null : next })
                    }}
                  >
                    {pv.sections[s]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingRow>

          <div className="space-y-1.5 pt-1">
            <label htmlFor="cv-notes" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {overrides.notes && <span className="size-1.5 rounded-full bg-foreground" aria-hidden />}
              {t.notes}
            </label>
            <Textarea
              id="cv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              maxLength={1500}
              placeholder={t.notesPlaceholder}
              className="min-h-20 text-xs"
            />
          </div>
          <p className="text-[11px] text-pretty text-muted-foreground">{t.nextTime}</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-2">
          <Button
            variant="ghost"
            size="xs"
            className="-ml-2"
            disabled={n === 0}
            onClick={() => {
              setNotes("")
              save.mutate(NO_OVERRIDES)
            }}
          >
            <RotateCcwIcon />
            {t.reset}
          </Button>
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs"
            onClick={() => {
              setOpen(false)
              onOpenDefaults()
            }}
          >
            {t.defaults}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The footer, on or off for this posting; nothing to choose while there's no footer text. */
function FooterRow({
  job,
  overrides,
  onChange,
}: {
  job: Pick<Job, "location">
  overrides: CvOverrides
  onChange: (footer: boolean | null) => void
}) {
  const all = useT()
  const t = all.cv.settings
  const defaults = useCvPrefs()
  const byDefault = footerApplies(defaults, jobCountry(job.location))
  const label = all.profileView.footer
  const name = (on: boolean) => (on ? t.footerOn : t.footerOff)
  if (!defaults.footer.trim())
    return (
      // Nothing to include; a choice stored for this posting still shows, so it can be cleared.
      <SettingRow
        label={label}
        changed={overrides.footer !== null}
        resetLabel={t.resetOne(name(false))}
        onReset={() => onChange(null)}
      >
        <span className="px-1 text-xs text-muted-foreground">{t.noFooter}</span>
      </SettingRow>
    )
  const on = overrides.footer ?? byDefault
  return (
    <SettingRow
      label={label}
      changed={overrides.footer !== null}
      resetLabel={t.resetOne(name(byDefault))}
      onReset={() => onChange(null)}
    >
      <Select value={on ? "on" : "off"} onValueChange={(v) => {
          const want = v === "on"
          onChange(want === byDefault ? null : want)
        }}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="on" className="text-xs">
            {name(true)}
          </SelectItem>
          <SelectItem value="off" className="text-xs">
            {name(false)}
          </SelectItem>
        </SelectContent>
      </Select>
    </SettingRow>
  )
}

function SettingRow({
  label,
  changed,
  resetLabel,
  onReset,
  children,
}: {
  label: string
  /** Set for this posting: marked, with a way back to the default. */
  changed: boolean
  resetLabel: string
  onReset: () => void
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_1.5rem] items-center gap-2">
      <span className={cn("flex items-center gap-1.5 truncate text-xs", changed ? "text-foreground" : "text-muted-foreground")}>
        {changed && <span className="size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />}
        {label}
      </span>
      {children}
      {changed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={resetLabel} onClick={onReset}>
              <RotateCcwIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{resetLabel}</TooltipContent>
        </Tooltip>
      ) : (
        <span />
      )}
    </div>
  )
}
