import { useId, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertCircleIcon, ClipboardPasteIcon, CornerDownLeftIcon, LinkIcon, LoaderCircleIcon, PlusIcon } from "lucide-react"

import { StatusDot } from "@/components/applications/status"
import { SiteMark } from "@/components/jobs/work-mode-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, type Job } from "@/lib/api"
import { STATUSES, useAddApplication, type AppStatus, type NewApplication } from "@/lib/applications"
import { DEFAULT_CURRENCY } from "@/lib/currencies"
import { useT } from "@/lib/i18n"
import { recognize } from "@/lib/job-link"
import { cn } from "@/lib/utils"

type Mode = "link" | "text"
interface Draft {
  url: string
  title: string
  company: string
  location: string
  description: string
}
const EMPTY: Draft = { url: "", title: "", company: "", location: "", description: "" }

/** "+ Add" in the page header: a posting found anywhere, from its link or its text. */
export function AddApplication({ onAdded }: { onAdded: (id: number) => void }) {
  const t = useT().applications.add
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t.button}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(48rem,90svh)] flex-col gap-0 p-0 sm:max-w-lg">
          {open && (
            <AddForm
              onCancel={() => setOpen(false)}
              onAdded={(id) => {
                setOpen(false)
                onAdded(id)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: (id: number) => void }) {
  const all = useT()
  const t = all.applications.add
  const id = useId()
  const client = useQueryClient()
  const [mode, setMode] = useState<Mode>("link")
  const [link, setLink] = useState("")
  const [reading, setReading] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [status, setStatus] = useState<AppStatus>("applied")
  const add = useAddApplication()

  const known = recognize(link)
  const wrong = !!link.trim() && !known
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }))

  const read = async () => {
    if (!known || reading) return
    setReading(true)
    setError(null)
    setJob(null)
    try {
      const r = await api.openLink(link.trim(), DEFAULT_CURRENCY)
      // A posting read for the first time is now among the saved ones: the jobs list refreshes.
      if (!r.known) void client.invalidateQueries({ queryKey: ["jobs"] })
      setJob(r.job)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReading(false)
    }
  }

  /** From a link the board wouldn't read, to the text form with what we know. */
  const toText = () => {
    setDraft({
      ...EMPTY,
      url: job?.url ?? link.trim(),
      title: job?.title ?? "",
      company: job?.company ?? "",
      location: job?.location ?? "",
    })
    setMode("text")
  }

  /**
   * The server keeps it: from a board link it takes the saved posting's text (and saves pasted
   * text as a posting, to be scored); a posting already tracked comes back instead.
   */
  const save = async (a: Omit<NewApplication, "status">) => {
    setError(null)
    try {
      const { application, created } = await add.mutateAsync({ ...a, status })
      if (created) {
        toast(t.added, { description: application.title })
        onAdded(application.id)
      } else {
        toast(t.duplicate, {
          description: application.title,
          action: { label: t.open, onClick: () => onAdded(application.id) },
        })
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const submit = () =>
    mode === "link"
      ? job &&
        save({
          url: job.url,
          title: job.title,
          company: job.company ?? "",
          location: job.location ?? "",
          description: job.description ?? "",
        })
      : save({ ...draft, url: draft.url.trim(), title: draft.title.trim() })

  const ready = mode === "link" ? !!job : !!draft.title.trim()

  return (
    <>
      <DialogHeader className="border-b px-6 pt-5 pb-4">
        <DialogTitle>{t.title}</DialogTitle>
        <DialogDescription>{t.description}</DialogDescription>
      </DialogHeader>

      <Tabs
        value={mode}
        onValueChange={(v) => {
          setMode(v as Mode)
          setError(null)
        }}
        className="min-h-0 flex-1 gap-0 overflow-y-auto"
      >
        <div className="px-6 pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="link">
              <LinkIcon />
              {t.fromLink}
            </TabsTrigger>
            <TabsTrigger value="text">
              <ClipboardPasteIcon />
              {t.fromText}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="link" className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-link`} className="text-xs">
              {t.linkLabel}
            </Label>
            <InputGroup className={cn(wrong && "border-destructive/50")}>
              <InputGroupAddon>
                {known ? <SiteMark site={known.site} /> : <LinkIcon className="text-muted-foreground" />}
              </InputGroupAddon>
              <InputGroupInput
                id={`${id}-link`}
                autoFocus
                value={link}
                onChange={(e) => {
                  setLink(e.target.value)
                  setJob(null)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void read()
                  }
                }}
                placeholder={t.linkPlaceholder}
                inputMode="url"
                spellCheck={false}
                aria-invalid={wrong || undefined}
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton variant="secondary" disabled={!known || reading} onClick={() => void read()}>
                  {reading ? <LoaderCircleIcon className="animate-spin" /> : <CornerDownLeftIcon />}
                  {reading ? t.reading : t.read}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className={cn("text-xs", wrong ? "text-destructive" : "text-muted-foreground")}>
              {wrong ? (
                <>
                  {t.unsupported}{" "}
                  <button type="button" className="text-foreground underline underline-offset-4" onClick={toText}>
                    {t.pasteInstead}
                  </button>
                </>
              ) : (
                t.linkHint
              )}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3.5">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium">{t.failed}</p>
                <p className="text-xs text-pretty text-muted-foreground">{error}</p>
                <Button size="xs" variant="outline" onClick={toText}>
                  <ClipboardPasteIcon />
                  {t.pasteInstead}
                </Button>
              </div>
            </div>
          )}

          {job && (
            <div className="space-y-1 rounded-lg border px-4 py-3">
              <SiteMark site={job.site} />
              <p className="pt-1 text-sm font-medium text-balance">{job.title}</p>
              <p className="text-xs text-muted-foreground">
                {[job.company, job.location].filter(Boolean).join(" · ")}
              </p>
              {!job.description?.trim() && (
                <p className="pt-1 text-xs text-muted-foreground">
                  {t.noText}{" "}
                  <button type="button" className="text-foreground underline underline-offset-4" onClick={toText}>
                    {t.pasteInstead}
                  </button>
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="text" className="grid gap-4 px-6 py-5">
          <Field id={`${id}-url`} label={t.url} hint={t.urlHint}>
            <Input id={`${id}-url`} value={draft.url} onChange={set("url")} inputMode="url" spellCheck={false} className="font-mono text-xs" />
          </Field>
          <Field id={`${id}-title`} label={t.role}>
            <Input id={`${id}-title`} autoFocus value={draft.title} onChange={set("title")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${id}-company`} label={t.company} optional={t.optional}>
              <Input id={`${id}-company`} value={draft.company} onChange={set("company")} />
            </Field>
            <Field id={`${id}-location`} label={t.location} optional={t.optional}>
              <Input id={`${id}-location`} value={draft.location} onChange={set("location")} />
            </Field>
          </div>
          <Field id={`${id}-text`} label={t.text} optional={t.optional} hint={t.textHint}>
            <Textarea id={`${id}-text`} value={draft.description} onChange={set("description")} className="max-h-60 min-h-28" />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </TabsContent>
      </Tabs>

      <DialogFooter className="m-0 items-center rounded-b-xl border-t px-6 py-3 sm:justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-status`} className="text-xs text-muted-foreground">
            {t.status}
          </Label>
          <Select value={status} onValueChange={(v) => setStatus(v as AppStatus)}>
            <SelectTrigger id={`${id}-status`} size="sm" className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  <StatusDot status={s} />
                  {all.applications.statuses[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            {all.common.cancel}
          </Button>
          <Button disabled={!ready || add.isPending} onClick={() => void submit()}>
            {add.isPending && <LoaderCircleIcon className="animate-spin" />}
            {t.submit}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

function Field({
  id,
  label,
  optional,
  hint,
  children,
}: {
  id: string
  label: string
  optional?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> {optional}</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
