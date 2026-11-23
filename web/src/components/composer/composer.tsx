import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Command as CommandPrimitive } from "cmdk"
import { ArrowUpIcon, BriefcaseBusinessIcon, CalendarIcon, CoinsIcon, CornerDownLeftIcon, XIcon } from "lucide-react"

import { ModesEditor, PhraseEditor, PlaceEditor } from "@/components/composer/piece-editors"
import { JobTypeEditor, PostedEditor, SalaryEditor, ScopeEditor, SitesEditor } from "@/components/filters/editors"
import { Button } from "@/components/ui/button"
import { Command, CommandGroup, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Scope, WorkMode } from "@/lib/api"
import { commitDraft, removeLast, suggest, type DraftKind, type Panel, type Patch, type Suggestion } from "@/lib/compose"
import { CLEARED, SITES, activeCount, useFilters, type FilterState } from "@/lib/filters"
import { MOD_KEY } from "@/lib/platform"
import { DEFAULT_CURRENCY, formatAmount } from "@/lib/currencies"
import { useT, type Messages } from "@/lib/i18n"
import { splitModes } from "@/lib/modes"
import { usePlaces } from "@/lib/queries"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ pieces */

/** A transparent, clickable box inside the sentence; opens its editor in a popover. */
function Piece({
  children,
  editor,
  title,
}: {
  children: ReactNode
  editor: (close: () => void) => ReactNode
  title?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          className={cn(
            "inline-flex h-7 max-w-64 items-center gap-1 truncate rounded-md border border-foreground/10 bg-foreground/[0.04] px-2 text-sm text-foreground transition-colors",
            "hover:border-foreground/20 hover:bg-foreground/[0.07] aria-expanded:border-foreground/25 aria-expanded:bg-foreground/[0.08]",
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      {/* Stop key events bubbling (through the portal) into cmdk's root handler. */}
      <PopoverContent align="start" className="w-auto p-0" onKeyDown={(e) => e.stopPropagation()}>
        {editor(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

function Word({ children, op }: { children: ReactNode; op?: boolean }) {
  return (
    <span
      className={cn(
        "text-sm text-muted-foreground select-none",
        op && "font-medium text-foreground/55",
      )}
    >
      {children}
    </span>
  )
}

/** "in sede o ibrido (o non indicata)": the same "(o non indicato/a)" as the salary piece. */
function modesPhrase(modes: WorkMode[], t: Messages): ReactNode {
  const phrase = t.composer.modePhrase // how each mode reads inside the sentence
  const { known, includeUnknown } = splitModes(modes)
  if (!known.length) return phrase.unknown // legacy: only "unknown" selected
  return (
    <>
      {known.map((m) => phrase[m]).join(` ${t.common.or} `)}
      {includeUnknown && <span className="text-muted-foreground">{t.composer.orUnknownMode}</span>}
    </>
  )
}

/** Edit one phrase, keeping the list free of duplicates (the server dedupes too). */
function replaceAt(list: string[], i: number, value: string): string[] {
  return [...new Set(list.map((x, j) => (j === i ? value.toLowerCase() : x)))]
}

function join(items: ReactNode[], sep: ReactNode) {
  return items.map((it, i) => (
    <Fragment key={i}>
      {i > 0 && sep}
      {it}
    </Fragment>
  ))
}

function Sentence({
  f,
  set,
  newGroup,
  draft,
  slot,
}: {
  f: FilterState
  set: (p: Patch) => void
  newGroup: boolean
  /** While a filter is being typed, `slot` (the input) is rendered where its value will go. */
  draft: DraftKind | null
  slot: ReactNode
}) {
  const t = useT()
  const c = t.composer
  const parts: ReactNode[] = []
  const hasTitle = f.title.length > 0 || draft === "title"
  const replaceScope = (i: number, s: Scope | null) =>
    set({ where: s ? f.where.map((x, j) => (j === i ? s : x)) : f.where.filter((_, j) => j !== i) })

  if (hasTitle)
    parts.push(
      <Fragment key="title">
        <Word>{c.jobsAs}</Word>
        {join(
          f.title.map((title, i) => (
            <Piece
              key={title}
              editor={(close) => (
                <PhraseEditor
                  title={c.titleEditor}
                  hint={c.titleHint}
                  initial={title}
                  onCancel={close}
                  onRemove={() => set({ title: f.title.filter((_, j) => j !== i) })}
                  onSave={(v) => (set({ title: replaceAt(f.title, i, v) }), close())}
                />
              )}
            >
              {title}
            </Piece>
          )),
          <Word op>{c.orWord}</Word>,
        )}
        {draft === "title" && (
          <>
            {f.title.length > 0 && <Word op>{c.orWord}</Word>}
            {slot}
          </>
        )}
      </Fragment>,
    )

  if (f.where.length || newGroup)
    parts.push(
      <Fragment key="where">
        {!hasTitle && <Word>{c.jobs}</Word>}
        {join(
          [
            ...f.where.map((s, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex flex-wrap items-center gap-1",
                  // The frame shows what belongs together; a lone piece has nothing to group.
                  (s.anywhere ? 1 : s.places.length) + (s.modes.length ? 1 : 0) > 1 &&
                    "rounded-lg bg-foreground/[0.03] py-0.5 pr-0.5 pl-1.5 ring-1 ring-foreground/[0.06] ring-inset",
                )}
              >
                {s.anywhere ? (
                  // "Ovunque" is the whole place group, not a city: edit the group (places + modes).
                  <Piece
                    editor={(close) => (
                      <ScopeEditor
                        initial={s}
                        onCancel={close}
                        onRemove={() => (replaceScope(i, null), close())}
                        onApply={(next) => (replaceScope(i, next), close())}
                      />
                    )}
                  >
                    {c.anywhere}
                  </Piece>
                ) : (
                  <>
                    <Word>{c.in}</Word>
                    {join(
                      s.places.map((p, k) => (
                        <Piece
                          key={`${p.geo_id ?? p.city}:${p.country}`}
                          title={[p.city, p.region, p.country.toUpperCase()].filter(Boolean).join(", ")}
                          editor={(close) => (
                            <PlaceEditor
                              initial={p}
                              onCancel={close}
                              onAnywhere={() => (replaceScope(i, { ...s, anywhere: true, places: [] }), close())}
                              onRemove={() =>
                                replaceScope(i, s.places.length > 1 ? { ...s, places: s.places.filter((_, j) => j !== k) } : null)
                              }
                              onSave={(np) => (replaceScope(i, { ...s, places: s.places.map((x, j) => (j === k ? np : x)) }), close())}
                            />
                          )}
                        >
                          {p.city}
                          {p.country !== "it" && (
                            <span className="font-mono text-[10px] text-muted-foreground uppercase">{p.country}</span>
                          )}
                        </Piece>
                      )),
                      <Word>{t.common.or}</Word>,
                    )}
                  </>
                )}
                {s.modes.length > 0 && (
                  <Piece
                    editor={(close) => (
                      <ModesEditor
                        initial={s.modes}
                        onCancel={close}
                        onRemove={() => replaceScope(i, { ...s, modes: [] })}
                        onSave={(m) => (replaceScope(i, { ...s, modes: m }), close())}
                      />
                    )}
                  >
                    {modesPhrase(s.modes, t)}
                  </Piece>
                )}
              </span>
            )),
            ...(newGroup
              ? [
                  <span key="pending" className="inline-flex h-8 items-center rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground">
                    {c.pendingGroup}
                  </span>,
                ]
              : []),
          ],
          <Word op>{c.orWord}</Word>,
        )}
      </Fragment>,
    )

  if (f.jt.length)
    parts.push(
      <Fragment key="jt">
        <Word>{c.ofType}</Word>
        <Piece
          editor={(close) => (
            <JobTypeEditor
              initial={f.jt}
              includeUnknown={f.jtnull}
              onCancel={close}
              onRemove={() => (set({ jt: null, jtnull: null }), close())}
              onApply={(types, unknown) => (set({ jt: types, jtnull: unknown }), close())}
            />
          )}
        >
          {f.jt.map((jt) => c.typePhrase[jt]).join(` ${t.common.or} `)}
          {f.jtnull && <span className="text-muted-foreground">{c.orUnknownType}</span>}
        </Piece>
      </Fragment>,
    )

  if (f.salary !== null)
    parts.push(
      <Fragment key="salary">
        <Word>{c.salaryAtLeast}</Word>
        <Piece
          editor={(close) => (
            <SalaryEditor
              initial={f.salary}
              includeUnknown={f.nosalary}
              currency={f.cur}
              onCancel={close}
              onRemove={() => set({ salary: null, nosalary: null, cur: null })}
              onApply={(min, unk, cur) => (set({ salary: min, nosalary: unk, cur: cur === DEFAULT_CURRENCY ? null : cur }), close())}
            />
          )}
        >
          <span className="font-mono">{formatAmount(f.salary * 1000)}</span>
          <span className="font-mono text-xs text-muted-foreground">{f.cur}</span>
          <span className="text-muted-foreground">
            {c.perYear}
            {f.nosalary && c.orUnknownSalary}
          </span>
        </Piece>
      </Fragment>,
    )

  if (f.posted !== null)
    parts.push(
      <Fragment key="posted">
        <Word>{c.published}</Word>
        <Piece editor={(close) => <PostedEditor initial={f.posted} onCancel={close} onApply={(h) => (set({ posted: h }), close())} />}>
          {c.postedPhrase[f.posted] ?? c.postedHours(f.posted)}
        </Piece>
      </Fragment>,
    )

  if (f.sites.length)
    parts.push(
      <Fragment key="sites">
        <Word>{c.on}</Word>
        <Piece
          editor={(close) => (
            <SitesEditor
              initial={f.sites}
              onCancel={close}
              onRemove={() => set({ sites: null })}
              onApply={(s) => (set({ sites: s.length === SITES.length ? null : s }), close())}
            />
          )}
        >
          {f.sites.map((s) => SITES.find((x) => x.value === s)?.label).join(", ")}
        </Piece>
      </Fragment>,
    )

  if (f.q || draft === "q")
    parts.push(
      <Fragment key="q">
        <Word>{parts.length ? c.mentioning : c.jobsMentioning}</Word>
        {draft === "q" ? (
          slot
        ) : (
        <Piece
          editor={(close) => (
            <PhraseEditor
              title={c.textEditor}
              hint={c.textHint}
              initial={f.q}
              onCancel={close}
              onRemove={() => set({ q: null })}
              onSave={(v) => (set({ q: v }), close())}
            />
          )}
        >
          «{f.q}»
        </Piece>
        )}
      </Fragment>,
    )

  // Different filters are AND-ed: say it, as "oppure" says OR.
  return <>{join(parts, <Word op>{c.andWord}</Word>)}</>
}

/* ------------------------------------------------------------------ composer */

export function Composer({
  onSubmit,
  autoFocus,
}: {
  /** "Run" the query: Enter on an empty input, ⌘/Ctrl+Enter, or the arrow button. */
  onSubmit: () => void
  autoFocus?: boolean
}) {
  const t = useT()
  const c = t.composer
  const [f, setFilters] = useFilters()
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  // Autofocus shouldn't pop the menu open on a clean page: wait for a click or a key.
  const [touched, setTouched] = useState(false)
  // Set once the user moves through the suggestions with the arrow keys.
  const [navigated, setNavigated] = useState(false)
  const [newGroup, setNewGroup] = useState(false)
  // Editor shown under the bar for filters set by picking rather than typing.
  const [panel, setPanel] = useState<Panel | null>(null)
  // A chip being typed into ("Titolo contiene …"); the input lives inside it meanwhile.
  const [draft, setDraft] = useState<DraftKind | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const set = (p: Patch) => setFilters(p)
  // Only look up cities for text that could be one (skip "-senior", "100k", "ultimi…").
  const placeText =
    draft || /^[\d>≥€$£]|^(stipendio|ral|salary|gehalt|lohn|ultim|last|letzt)/i.test(text.trim()) ? "" : text
  const { places } = usePlaces(placeText)
  // No suggestions while typing a drafted value: Enter turns it into a piece.
  const items = useMemo(
    () => (draft ? [] : suggest(text, f, newGroup, places)),
    [text, f, newGroup, places, draft],
  )
  const empty = activeCount(f) === 0 && !f.q
  const menuOpen = focused && (touched || !!text) && items.length > 0

  // The input moves into the sentence while drafting (and back after), which remounts it:
  // refocus the new element, and ignore the blur the move may cause.
  const moving = useRef(false)
  useEffect(() => {
    if (!moving.current) return
    moving.current = false
    input.current?.focus()
  }, [draft])

  /** `refocus`: stay in the bar (Enter/Esc); not when the user clicked away. */
  const closeDraft = (commit: boolean, refocus = true) => {
    moving.current = refocus
    const p = commit && draft ? commitDraft(f, draft, text) : null
    if (p) set(p)
    setDraft(null)
    setText("")
  }

  const pick = (s: Suggestion) => {
    if (s.draft) {
      startDraft(s.draft)
      return
    }
    if (s.panel) {
      setText("")
      setPanel(s.panel)
      return
    }
    if (s.patch) set(s.patch)
    setNewGroup(!!s.keepGroup && (s.patch === null || newGroup))
    setNavigated(false)
    setDraft(null)
    setText("")
    input.current?.focus()
  }

  /** Open an empty piece of `kind` in the sentence, with the cursor after its label. */
  const startDraft = (kind: DraftKind) => {
    moving.current = true
    setDraft(kind)
    setText("")
    setNavigated(false)
    setFocused(true)
  }

  // Bare cmdk input: shadcn's CommandInput wraps it in a boxed search field,
  // which can't sit inline inside the sentence.
  const inputEl = (
    <CommandPrimitive.Input
      ref={input}
      value={text}
      onValueChange={(v) => {
        setText(v)
        setNavigated(false)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        if (moving.current) return
        if (draft) closeDraft(true, false) // leaving the field keeps what was typed
        setTimeout(() => (setFocused(false), setTouched(false), setNavigated(false)), 120)
      }}
      onPointerDown={() => setTouched(true)}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        setTouched(true)
        if (draft) {
          if (e.key === "Enter") {
            e.preventDefault() // we commit ourselves; cmdk mustn't select too
            if (text.trim()) closeDraft(true)
          } else if (e.key === "Escape" || (e.key === "Backspace" && !text)) {
            e.preventDefault()
            closeDraft(false)
          }
          return
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") setNavigated(true)
        // Enter selects the highlighted suggestion (cmdk) unless the user means "run":
        // ⌘/Ctrl+Enter always runs; plain Enter on an empty input runs a non-empty query,
        // as long as they haven't picked a suggestion with the arrows.
        const run =
          e.key === "Enter" &&
          (e.metaKey || e.ctrlKey || (!text.trim() && !empty && !(navigated && menuOpen)))
        if (run) {
          e.preventDefault() // keep cmdk from also selecting the highlighted item
          if (!empty) {
            onSubmit()
            input.current?.blur()
          }
        } else if (e.key === "Backspace" && !text) {
          if (newGroup) setNewGroup(false)
          else {
            const p = removeLast(f)
            if (p) set(p)
          }
        } else if (e.key === "Escape") {
          setText("")
          input.current?.blur()
        }
      }}
      placeholder={
        draft
          ? ""
          : empty
              ? c.placeholder
              : newGroup
                ? c.placeholderGroup
                : c.placeholderMore
      }
      className={cn(
        "h-7 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70",
        draft ? "field-sizing-content min-w-16" : "min-w-40 flex-1",
      )}
    />
  )

  return (
    <Command shouldFilter={false} loop label={c.label} className="relative size-auto overflow-visible rounded-none! bg-transparent p-0">
      <Popover open={panel !== null} onOpenChange={(o) => !o && setPanel(null)}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "rounded-2xl border bg-card shadow-xs transition-[box-shadow,border-color]",
              focused && "border-foreground/20 shadow-[0_0_0_4px] shadow-foreground/[0.04]",
            )}
            onClick={(e) => e.target === e.currentTarget && (setTouched(true), input.current?.focus())}
          >
            <div
              className="flex min-h-14 flex-wrap items-center gap-x-1.5 gap-y-2 px-4 pt-3.5 pb-2"
              onClick={(e) => e.target === e.currentTarget && (setTouched(true), input.current?.focus())}
            >
              <Sentence f={f} set={set} newGroup={newGroup} draft={draft} slot={draft ? inputEl : null} />
              {!draft && inputEl}
            </div>

            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPanel("scope")}>
                {c.addGroup}
              </Button>
              <span className="mx-1 h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPanel("jobtype")}>
                <BriefcaseBusinessIcon />
                {c.jobType}
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPanel("salary")}>
                <CoinsIcon />
                {c.salary}
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPanel("posted")}>
                <CalendarIcon />
                {c.date}
              </Button>
              <div className="ml-auto flex items-center gap-1.5">
                {!empty && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label={c.clear}
                    onClick={() => {
                      set({ ...CLEARED, q: null })
                      setNewGroup(false)
                      setText("")
                    }}
                  >
                    <XIcon />
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  className="rounded-full"
                  disabled={empty}
                  aria-label={c.run}
                  onClick={onSubmit}
                >
                  <ArrowUpIcon />
                </Button>
              </div>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-auto p-0" onKeyDown={(e) => e.stopPropagation()}>
          {panel === "scope" && (
            <ScopeEditor
              onCancel={() => setPanel(null)}
              onApply={(s) => {
                set({ where: [...f.where, s] })
                setPanel(null)
              }}
            />
          )}
          {panel === "salary" && (
            <SalaryEditor
              initial={f.salary}
              includeUnknown={f.nosalary}
              currency={f.cur}
              onCancel={() => setPanel(null)}
              onRemove={f.salary !== null ? () => (set({ salary: null, nosalary: null, cur: null }), setPanel(null)) : undefined}
              onApply={(min, unknown, cur) => {
                set({ salary: min, nosalary: unknown, cur: cur === DEFAULT_CURRENCY ? null : cur })
                setPanel(null)
              }}
            />
          )}
          {panel === "jobtype" && (
            <JobTypeEditor
              initial={f.jt}
              includeUnknown={f.jtnull}
              onCancel={() => setPanel(null)}
              onRemove={f.jt.length ? () => (set({ jt: null, jtnull: null }), setPanel(null)) : undefined}
              onApply={(types, unknown) => {
                set({ jt: types, jtnull: unknown })
                setPanel(null)
              }}
            />
          )}
          {panel === "posted" && (
            <PostedEditor
              initial={f.posted}
              onCancel={() => setPanel(null)}
              onApply={(hours) => {
                set({ posted: hours })
                setPanel(null)
              }}
            />
          )}
        </PopoverContent>
      </Popover>

      {menuOpen && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <CommandList className="max-h-80 p-1">
            <CommandGroup heading={text.trim() ? c.addToQuery : c.suggestions} className="p-0">
              {items.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onSelect={() => pick(s)}
                  className="h-9 cursor-pointer gap-2.5 rounded-md"
                >
                  <s.icon className="text-muted-foreground" />
                  <span className="truncate">{s.label}</span>
                  {s.value && <span className="font-mono text-[10px] text-muted-foreground">{s.value}</span>}
                  {s.hint && <CommandShortcut className="truncate pl-4 tracking-normal">{s.hint}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center gap-3 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> {c.keyChoose}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>
                <CornerDownLeftIcon className="size-3" />
              </Kbd>{" "}
              {c.keyAdd}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>⌫</Kbd> {c.keyBack}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>{MOD_KEY}</Kbd>
              <Kbd>
                <CornerDownLeftIcon className="size-3" />
              </Kbd>{" "}
              {c.keyRun}
            </span>
          </div>
        </div>
      )}
    </Command>
  )
}

