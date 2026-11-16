import { useState } from "react"

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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Experience, Profile } from "@/lib/profile-mock"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Shell({
  open,
  onOpenChange,
  title,
  description,
  onSave,
  children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  onSave: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-4">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() => {
              onSave()
              onOpenChange(false)
            }}
          >
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function IdentityDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  profile: Profile
  onSave: (p: Profile) => void
}) {
  const [draft, setDraft] = useState(profile)
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value })
  return (
    <Shell
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(profile)
        onOpenChange(o)
      }}
      title="Informazioni personali"
      onSave={() => onSave(draft)}
    >
      <Field label="Nome e cognome">
        <Input value={draft.name} onChange={set("name")} />
      </Field>
      <Field label="Titolo" hint="Una riga, come sotto il nome su LinkedIn.">
        <Input value={draft.headline} onChange={set("headline")} placeholder="Backend Engineer · Python" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Città">
          <Input value={draft.location} onChange={set("location")} />
        </Field>
        <Field label="Email">
          <Input type="email" value={draft.email} onChange={set("email")} />
        </Field>
      </div>
    </Shell>
  )
}

export function SummaryDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  profile: Profile
  onSave: (p: Profile) => void
}) {
  const [text, setText] = useState(profile.summary)
  return (
    <Shell
      open={open}
      onOpenChange={(o) => {
        if (o) setText(profile.summary)
        onOpenChange(o)
      }}
      title="Riepilogo"
      description="Il punto di partenza: per ogni offerta lo riscriviamo puntando su quello che chiede."
      onSave={() => onSave({ ...profile, summary: text })}
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-36" />
      <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length} / 600</p>
    </Shell>
  )
}

const NEW: Experience = { id: "", role: "", company: "", place: "", start: "", end: null, bullets: [] }

export function ExperienceDialog({
  experience,
  open,
  onOpenChange,
  onSave,
}: {
  experience: Experience | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (e: Experience) => void
}) {
  const source = experience ?? NEW
  const [draft, setDraft] = useState(source)
  const [bullets, setBullets] = useState(source.bullets.join("\n"))
  // Reset the form whenever a different entry opens (state adjusted during render).
  const [shown, setShown] = useState<Experience | null>(null)
  if (open && shown !== source) {
    setShown(source)
    setDraft(source)
    setBullets(source.bullets.join("\n"))
  }
  const set = (k: keyof Experience) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value })

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={experience ? "Modifica esperienza" : "Aggiungi esperienza"}
      onSave={() =>
        onSave({
          ...draft,
          id: draft.id || crypto.randomUUID(),
          review: undefined,
          bullets: bullets
            .split("\n")
            .map((b) => b.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean),
        })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ruolo">
          <Input value={draft.role} onChange={set("role")} placeholder="Backend Engineer" />
        </Field>
        <Field label="Azienda">
          <Input value={draft.company} onChange={set("company")} />
        </Field>
      </div>
      <Field label="Luogo e modalità">
        <Input value={draft.place} onChange={set("place")} placeholder="Milano · ibrido" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inizio">
          <Input value={draft.start} onChange={set("start")} placeholder="mar 2022" />
        </Field>
        <Field label="Fine">
          <Input
            value={draft.end ?? ""}
            disabled={draft.end === null}
            onChange={set("end")}
            placeholder={draft.end === null ? "oggi" : "feb 2024"}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.end === null} onCheckedChange={(c) => setDraft({ ...draft, end: c ? null : "" })} />
        Ci lavoro ancora
      </label>
      <Field label="Risultati" hint="Uno per riga. I numeri contano: «p95 da 820 a 490 ms» vale più di «migliorato le prestazioni».">
        <Textarea value={bullets} onChange={(e) => setBullets(e.target.value)} className="min-h-28" />
      </Field>
    </Shell>
  )
}
