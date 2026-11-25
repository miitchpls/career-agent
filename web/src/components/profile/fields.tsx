import { useRef, useState } from "react"
import { FileTextIcon, ImageIcon, LinkIcon, PaperclipIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { msgs, useT } from "@/lib/i18n"
import { monthNames, profileStore, uid, type Media, type MonthYear } from "@/lib/profile"
import { cn } from "@/lib/utils"

export function Field({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  /** Shown instead of the hint, in the destructive colour. */
  error?: string | null
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-xs">
        {label}
        {required && <span className="text-muted-foreground">*</span>}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

/** Section heading inside a long form. */
export function FormGroup({
  title,
  description,
  required,
  children,
}: {
  title: string
  description?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 border-t pt-5 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-medium">
          {title}
          {required && <span className="ml-1 text-muted-foreground">*</span>}
        </p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/** Dialog for one profile entry: scrolling body, Save/Cancel, and Delete when editing. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSave,
  onDelete,
  canSave = true,
  wide,
  footnote,
  children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  onSave: () => void
  onDelete?: () => void
  canSave?: boolean
  wide?: boolean
  /** Left of the buttons when there's no Delete; by default, what the asterisk means. */
  footnote?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[min(52rem,90svh)] flex-col gap-0 p-0", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-5">{children}</div>
        <DialogFooter className="m-0 rounded-b-xl border-t px-6 py-3 sm:justify-between">
          {onDelete ? (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onDelete()
                onOpenChange(false)
              }}
            >
              <Trash2Icon />
              {t.common.delete}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{footnote === undefined ? t.profile.required : footnote}</span>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={!canSave}
              onClick={() => {
                onSave()
                onOpenChange(false)
              }}
            >
              {t.common.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const YEARS = Array.from({ length: 60 }, (_, i) => new Date().getFullYear() + 5 - i)
const NONE = "none"

/** Month + year, the month optional, like LinkedIn's date fields. */
export function MonthYearField({
  label,
  value,
  onChange,
  disabled,
  required,
  error,
}: {
  label: string
  value: MonthYear | null
  onChange: (v: MonthYear | null) => void
  disabled?: boolean
  required?: boolean
  error?: string | null
}) {
  const t = useT().profile
  return (
    <Field label={label} required={required} error={error}>
      <div className="grid grid-cols-[1fr_6.5rem] gap-2">
        <Select
          disabled={disabled || !value}
          value={value?.month == null ? NONE : String(value.month)}
          onValueChange={(m) => value && onChange({ ...value, month: m === NONE ? null : Number(m) })}
        >
          <SelectTrigger className="w-full" aria-invalid={!!error || undefined}>
            <SelectValue placeholder={t.month} />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NONE}>{t.month}</SelectItem>
            {monthNames("long").map((m, i) => (
              <SelectItem key={m} value={String(i)} className="capitalize">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          disabled={disabled}
          value={value ? String(value.year) : NONE}
          onValueChange={(y) => onChange(y === NONE ? null : { month: value?.month ?? null, year: Number(y) })}
        >
          <SelectTrigger className="w-full" aria-invalid={!!error || undefined}>
            <SelectValue placeholder={t.year} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-64">
            <SelectItem value={NONE}>{t.year}</SelectItem>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  )
}

/**
 * Skills for one entry. Suggestions come from the profile's list; a new name typed here
 * joins that list on save.
 */
export function SkillPicker({
  value,
  onChange,
  known,
  placeholder,
}: {
  value: string[]
  onChange: (v: string[]) => void
  known: string[]
  placeholder?: string
}) {
  const t = useT().profile
  const [draft, setDraft] = useState("")
  const q = draft.trim().toLowerCase()
  const suggestions = known.filter((k) => !value.includes(k) && (!q || k.toLowerCase().includes(q))).slice(0, 8)
  const add = (name: string) => {
    const n = name.trim()
    if (n && !value.some((v) => v.toLowerCase() === n.toLowerCase())) onChange([...value, n])
    setDraft("")
  }
  const isNew = q && !known.some((k) => k.toLowerCase() === q) && !value.some((v) => v.toLowerCase() === q)

  return (
    <div className="grid gap-2.5">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border px-1.5 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <AnimatePresence initial={false}>
          {value.map((s) => (
            <motion.span
              key={s}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
              className="inline-flex h-6 items-center gap-0.5 rounded-full bg-secondary pr-0.5 pl-2 text-xs"
            >
              {s}
              <button
                type="button"
                aria-label={t.removeSkill(s)}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => onChange(value.filter((v) => v !== s))}
              >
                <XIcon className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(draft)
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
          }}
          placeholder={value.length ? "" : (placeholder ?? t.skillPlaceholder)}
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {(suggestions.length > 0 || isNew) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">{q ? t.matches : t.fromProfile}</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
            >
              <PlusIcon className="size-3" />
              {s}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onClick={() => add(draft)}
              className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors hover:bg-muted"
            >
              <PlusIcon className="size-3" />
              {t.create(draft.trim())}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const MEDIA_ICON = { image: ImageIcon, document: FileTextIcon, link: LinkIcon }

function MediaThumb({ m, className }: { m: Media; className?: string }) {
  const Icon = MEDIA_ICON[m.kind]
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/60", className)}>
      {m.kind === "image" && m.url ? (
        <img src={m.url} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-4 text-muted-foreground" />
      )}
    </div>
  )
}

/** Files and links attached to an entry: images, PDFs, slides, a talk, a repo. */
export function MediaEditor({ value, onChange }: { value: Media[]; onChange: (v: Media[]) => void }) {
  const all = useT()
  const t = all.profile
  const file = useRef<HTMLInputElement>(null)
  const [link, setLink] = useState<{ title: string; url: string } | null>(null)
  const rename = (id: string, title: string) => onChange(value.map((m) => (m.id === id ? { ...m, title } : m)))

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="grid gap-1.5">
          {value.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 rounded-lg border p-1.5 pr-1">
              <MediaThumb m={m} className="size-9" />
              <Input
                value={m.title}
                onChange={(e) => rename(m.id, e.target.value)}
                aria-label={t.mediaTitle}
                className="h-8 border-transparent shadow-none hover:border-input focus-visible:border-ring"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.removeNamed(m.title)}
                onClick={() => onChange(value.filter((x) => x.id !== m.id))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {link && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
              <Input
                autoFocus
                placeholder="https://"
                value={link.url}
                onChange={(e) => setLink({ ...link, url: e.target.value })}
              />
              <Input placeholder={t.mediaTitle} value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setLink(null)}>
                  {all.common.cancel}
                </Button>
                <Button
                  size="sm"
                  disabled={!link.url.trim()}
                  onClick={() => {
                    onChange([...value, { id: uid(), kind: "link", url: link.url, title: link.title || link.url }])
                    setLink(null)
                  }}
                >
                  {all.common.add}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
          <PaperclipIcon />
          {t.uploadFile}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLink({ title: "", url: "" })} disabled={!!link}>
          <LinkIcon />
          {t.addLink}
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        multiple
        accept="image/*,.pdf,.ppt,.pptx,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ""
          // Stored by the server, so the attachment is still there after a reload.
          Promise.all(files.map((f) => profileStore.upload(f)))
            .then((uploaded) =>
              onChange([
                ...value,
                ...uploaded.map((up) => ({
                  id: uid(),
                  kind: up.mime.startsWith("image/") ? ("image" as const) : ("document" as const),
                  title: up.name,
                  url: up.url,
                })),
              ]),
            )
            .catch((err: Error) => toast.error(msgs().profile.uploadFailed, { description: err.message }))
        }}
      />
    </div>
  )
}

/** Attached media in the profile view: small cards under the entry. */
export function MediaStrip({ media }: { media: Media[] }) {
  if (media.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {media.map((m) => (
        <a
          key={m.id}
          href={m.url}
          target="_blank"
          rel="noreferrer"
          className="group/media flex w-52 items-center gap-2.5 rounded-lg border p-1.5 pr-2.5 transition-colors hover:bg-muted/50"
        >
          <MediaThumb m={m} className="h-10 w-14" />
          <span className="line-clamp-2 text-xs leading-snug">{m.title}</span>
        </a>
      ))}
    </div>
  )
}

/** Linked skills under an entry, LinkedIn's "Competenze: A, B e altre 2". */
export function SkillLine({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1">
      {skills.map((s) => (
        <span key={s} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
          {s}
        </span>
      ))}
    </div>
  )
}
