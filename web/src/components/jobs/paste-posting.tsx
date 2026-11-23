import { useId, useState } from "react"
import { ArrowUpRightIcon, LoaderCircleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PastedPosting } from "@/lib/api"
import { useT } from "@/lib/i18n"

/**
 * When the board won't show a posting: the user copies it from the page they see and saves it
 * under the same link. Nothing is fetched.
 */
export function PastePosting({
  site,
  url,
  initial,
  onSave,
  onCancel,
}: {
  site: string
  url: string
  /** What the saved posting already says (title, company, place). */
  initial?: Partial<PastedPosting>
  onSave: (posting: PastedPosting) => Promise<void>
  onCancel: () => void
}) {
  const all = useT()
  const t = all.link.paste
  const id = useId()
  const [posting, setPosting] = useState<PastedPosting>({ title: "", company: "", location: "", description: "", ...initial })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = !!posting.title.trim() && !!posting.description.trim()
  const set = (key: keyof PastedPosting) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setPosting((p) => ({ ...p, [key]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSave(posting)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t px-6 py-6">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t.title}</h3>
        <p className="text-sm text-muted-foreground">
          {t.description(site)}{" "}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60"
          >
            {all.link.openOnSite(site)}
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-title`}>{t.role}</Label>
        <Input id={`${id}-title`} autoFocus required value={posting.title} onChange={set("title")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-company`}>
            {t.company} <span className="font-normal text-muted-foreground">{t.optional}</span>
          </Label>
          <Input id={`${id}-company`} value={posting.company} onChange={set("company")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-location`}>
            {t.location} <span className="font-normal text-muted-foreground">{t.optional}</span>
          </Label>
          <Input id={`${id}-location`} value={posting.location} onChange={set("location")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-text`}>{t.text}</Label>
        <Textarea
          id={`${id}-text`}
          required
          value={posting.description}
          onChange={set("description")}
          placeholder={t.textPlaceholder}
          className="max-h-80 min-h-40"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!ready || busy}>
          {busy && <LoaderCircleIcon className="animate-spin" />}
          {t.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {all.common.cancel}
        </Button>
      </div>
    </form>
  )
}
