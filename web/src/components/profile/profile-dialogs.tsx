import { PlusIcon, XIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Field, FormDialog, FormGroup, MediaEditor, MonthYearField, SkillPicker } from "@/components/profile/fields"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDraft } from "@/lib/use-draft"
import {
  CEFR,
  EMPLOYMENT,
  LOCATION_TYPES,
  PROFICIENCY,
  uid,
  type Certification,
  type Education,
  type Experience,
  type Language,
  type LanguageLevel,
  type Profile,
  type Project,
  type SkillUse,
} from "@/lib/profile-mock"

interface EntryDialog<T> {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** null: a new entry */
  entry: T | null
  profile: Profile
  onSave: (e: T) => void
  onDelete: (e: T) => void
}

const known = (p: Profile) => p.skills.map((s) => s.name)
const NONE = "none"

// --- Personal info ---------------------------------------------------------------------------

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
  const [d, setD] = useDraft(open, profile)
  const text = (k: "name" | "headline" | "location" | "email") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })
  const setLink = (id: string, patch: Partial<Profile["links"][number]>) =>
    setD({ ...d, links: d.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Informazioni personali"
      canSave={!!d.name.trim()}
      onSave={() => onSave({ ...d, links: d.links.filter((l) => l.url.trim()) })}
    >
      <FormGroup title="Chi sei">
        <Field label="Nome e cognome" required>
          <Input value={d.name} onChange={text("name")} />
        </Field>
        <Field label="Titolo" hint="Una riga, come sotto il nome su LinkedIn.">
          <Input value={d.headline} onChange={text("headline")} placeholder="Backend Engineer · Python" />
        </Field>
      </FormGroup>

      <FormGroup title="Contatti">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Città">
            <Input value={d.location} onChange={text("location")} />
          </Field>
          <Field label="Email">
            <Input type="email" value={d.email} onChange={text("email")} />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="Link" description="Profili, portfolio, articoli: compaiono sotto il nome e nell'intestazione del CV.">
        <ul className="grid gap-2">
          <AnimatePresence initial={false}>
            {d.links.map((l) => (
              <motion.li
                key={l.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="group flex items-center gap-1.5"
              >
                <Input
                  value={l.label}
                  onChange={(e) => setLink(l.id, { label: e.target.value })}
                  placeholder="Titolo"
                  aria-label="Titolo del link"
                  className="w-36 shrink-0"
                />
                <Input
                  value={l.url}
                  onChange={(e) => setLink(l.id, { url: e.target.value })}
                  placeholder="https://"
                  aria-label="Indirizzo del link"
                  className="font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Rimuovi link"
                  onClick={() => setD({ ...d, links: d.links.filter((x) => x.id !== l.id) })}
                >
                  <XIcon />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setD({ ...d, links: [...d.links, { id: uid(), label: "", url: "" }] })}
        >
          <PlusIcon />
          Aggiungi link
        </Button>
      </FormGroup>
    </FormDialog>
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
  const [text, setText] = useDraft(open, profile.summary)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Riepilogo"
      description="Il punto di partenza: per ogni offerta lo riscriviamo puntando su quello che chiede."
      onSave={() => onSave({ ...profile, summary: text })}
    >
      <div className="grid gap-1.5">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2600} className="min-h-44" />
        <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length} / 2600</p>
      </div>
    </FormDialog>
  )
}

// --- Experience ------------------------------------------------------------------------------

const NEW_EXPERIENCE: Experience = {
  id: "",
  role: "",
  employment: null,
  company: "",
  location: "",
  locationType: null,
  start: null,
  end: null,
  current: false,
  bullets: [],
  skills: [],
  media: [],
}

export function ExperienceDialog({ open, onOpenChange, entry, profile, onSave, onDelete }: EntryDialog<Experience>) {
  const source = entry ?? NEW_EXPERIENCE
  const [d, setD] = useDraft(open, source)
  const [bullets, setBullets] = useDraft(open, source.bullets.join("\n"))
  const text = (k: "role" | "company" | "location") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? "Modifica esperienza" : "Aggiungi esperienza"}
      canSave={!!d.role.trim() && !!d.company.trim() && !!d.start}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() =>
        onSave({
          ...d,
          id: d.id || uid(),
          review: undefined,
          end: d.current ? null : d.end,
          bullets: bullets
            .split("\n")
            .map((b) => b.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean),
        })
      }
    >
      <FormGroup title="Ruolo">
        <Field label="Qualifica" required>
          <Input value={d.role} onChange={text("role")} placeholder="Backend Engineer" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Azienda" required>
            <Input value={d.company} onChange={text("company")} />
          </Field>
          <Field label="Tipo di impiego">
            <Select
              value={d.employment ?? NONE}
              onValueChange={(v) => setD({ ...d, employment: v === NONE ? null : (v as Experience["employment"]) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NONE}>Non indicato</SelectItem>
                {EMPLOYMENT.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Località">
            <Input value={d.location} onChange={text("location")} placeholder="Milano" />
          </Field>
          <Field label="Tipo di località">
            <Select
              value={d.locationType ?? NONE}
              onValueChange={(v) => setD({ ...d, locationType: v === NONE ? null : (v as Experience["locationType"]) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NONE}>Non indicato</SelectItem>
                {LOCATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="Periodo">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.current} onCheckedChange={(c) => setD({ ...d, current: c })} />
          Attualmente ricopro questo ruolo
        </label>
        <div className="grid grid-cols-2 gap-3">
          <MonthYearField label="Data di inizio" required value={d.start} onChange={(start) => setD({ ...d, start })} />
          <MonthYearField label="Data di fine" value={d.current ? null : d.end} disabled={d.current} onChange={(end) => setD({ ...d, end })} />
        </div>
      </FormGroup>

      <FormGroup title="Cosa hai fatto">
        <Field label="Risultati" hint="Uno per riga. I numeri contano: «p95 da 820 a 490 ms» vale più di «migliorato le prestazioni».">
          <Textarea value={bullets} onChange={(e) => setBullets(e.target.value)} className="min-h-32" />
        </Field>
      </FormGroup>

      <FormGroup title="Competenze" description="Quelle che hai usato in questo ruolo. Le nuove si aggiungono anche alla sezione Competenze.">
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title="Contenuti multimediali" description="Immagini, documenti, presentazioni o link a un lavoro di questo periodo.">
        <MediaEditor value={d.media} onChange={(media) => setD({ ...d, media })} />
      </FormGroup>
    </FormDialog>
  )
}

// --- Education -------------------------------------------------------------------------------

const NEW_EDUCATION: Education = {
  id: "",
  school: "",
  degree: "",
  field: "",
  start: null,
  end: null,
  grade: "",
  activities: "",
  description: "",
  skills: [],
  media: [],
}

export function EducationDialog({ open, onOpenChange, entry, profile, onSave, onDelete }: EntryDialog<Education>) {
  const [d, setD] = useDraft(open, entry ?? NEW_EDUCATION)
  const text = (k: "school" | "degree" | "field" | "grade") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? "Modifica formazione" : "Aggiungi formazione"}
      canSave={!!d.school.trim()}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), review: undefined })}
    >
      <FormGroup title="Percorso">
        <Field label="Scuola o università" required>
          <Input value={d.school} onChange={text("school")} placeholder="Politecnico di Torino" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Titolo di studio">
            <Input value={d.degree} onChange={text("degree")} placeholder="Laurea magistrale" />
          </Field>
          <Field label="Corso di studi">
            <Input value={d.field} onChange={text("field")} placeholder="Ingegneria Informatica" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MonthYearField label="Data di inizio" value={d.start} onChange={(start) => setD({ ...d, start })} />
          <MonthYearField label="Data di fine (o prevista)" value={d.end} onChange={(end) => setD({ ...d, end })} />
        </div>
        <Field label="Votazione" className="w-1/2 pr-1.5">
          <Input value={d.grade} onChange={text("grade")} placeholder="110/110" />
        </Field>
      </FormGroup>

      <FormGroup title="Dettagli">
        <Field label="Attività e associazioni" hint="Gruppi, squadre, tutorato, rappresentanza.">
          <Textarea value={d.activities} onChange={(e) => setD({ ...d, activities: e.target.value })} className="min-h-16" />
        </Field>
        <Field label="Descrizione" hint="Tesi, progetti, scambi all'estero.">
          <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-24" />
        </Field>
      </FormGroup>

      <FormGroup title="Competenze">
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title="Contenuti multimediali">
        <MediaEditor value={d.media} onChange={(media) => setD({ ...d, media })} />
      </FormGroup>
    </FormDialog>
  )
}

// --- Language --------------------------------------------------------------------------------

const NEW_LANGUAGE: Language = { id: "", name: "", level: "professional", certificate: "" }
const LANGUAGE_SUGGESTIONS = ["Inglese", "Tedesco", "Francese", "Spagnolo", "Portoghese", "Cinese", "Arabo", "Russo"]

export function LanguageDialog({ open, onOpenChange, entry, profile, onSave, onDelete }: EntryDialog<Language>) {
  const [d, setD] = useDraft(open, entry ?? NEW_LANGUAGE)
  const taken = new Set(profile.languages.map((l) => l.name))
  const cefr = (CEFR as readonly string[]).includes(d.level)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? "Modifica lingua" : "Aggiungi lingua"}
      canSave={!!d.name.trim()}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), certificate: cefr ? d.certificate : "" })}
    >
      <Field label="Lingua" required>
        <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Inglese" />
      </Field>
      {!entry && !d.name && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {LANGUAGE_SUGGESTIONS.filter((l) => !taken.has(l)).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setD({ ...d, name: l })}
              className="h-6 rounded-full border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <Field
        label="Livello"
        hint={cefr ? "Livello del Quadro europeo: indicalo se hai un certificato o un test." : "Autovalutazione, come su LinkedIn: va bene quando non hai un certificato."}
      >
        <Select value={d.level} onValueChange={(v) => setD({ ...d, level: v as LanguageLevel })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectLabel>Senza certificazione</SelectLabel>
              {Object.entries(PROFICIENCY).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Quadro europeo (QCER)</SelectLabel>
              {CEFR.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="font-mono">{c}</span>
                  <span className="text-muted-foreground">{CEFR_HINT[c]}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <AnimatePresence initial={false}>
        {cefr && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Field label="Certificato" hint="Facoltativo: nome e punteggio, per esempio «IELTS Academic 7.5» o «Goethe-Zertifikat B2».">
              <Input value={d.certificate} onChange={(e) => setD({ ...d, certificate: e.target.value })} />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </FormDialog>
  )
}

const CEFR_HINT: Record<(typeof CEFR)[number], string> = {
  A1: "base",
  A2: "elementare",
  B1: "intermedio",
  B2: "intermedio superiore",
  C1: "avanzato",
  C2: "padronanza",
}

// --- Certification ---------------------------------------------------------------------------

const NEW_CERTIFICATION: Certification = {
  id: "",
  name: "",
  issuer: "",
  issued: null,
  expires: null,
  credentialId: "",
  url: "",
  skills: [],
  media: [],
}

export function CertificationDialog({ open, onOpenChange, entry, profile, onSave, onDelete }: EntryDialog<Certification>) {
  const [d, setD] = useDraft(open, entry ?? NEW_CERTIFICATION)
  const text = (k: "name" | "issuer" | "credentialId" | "url") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? "Modifica certificazione" : "Aggiungi certificazione"}
      canSave={!!d.name.trim() && !!d.issuer.trim()}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid() })}
    >
      <FormGroup title="Certificazione">
        <Field label="Nome" required>
          <Input value={d.name} onChange={text("name")} placeholder="AWS Certified Developer – Associate" />
        </Field>
        <Field label="Organizzazione emittente" required>
          <Input value={d.issuer} onChange={text("issuer")} placeholder="Amazon Web Services" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <MonthYearField label="Data di rilascio" value={d.issued} onChange={(issued) => setD({ ...d, issued })} />
          <MonthYearField label="Data di scadenza" value={d.expires} onChange={(expires) => setD({ ...d, expires })} />
        </div>
      </FormGroup>

      <FormGroup title="Verifica" description="Chi legge il CV può controllare la credenziale.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="ID credenziale">
            <Input value={d.credentialId} onChange={text("credentialId")} className="font-mono text-xs" />
          </Field>
          <Field label="URL credenziale">
            <Input value={d.url} onChange={text("url")} placeholder="https://" className="font-mono text-xs" />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="Competenze">
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title="Contenuti multimediali">
        <MediaEditor value={d.media} onChange={(media) => setD({ ...d, media })} />
      </FormGroup>
    </FormDialog>
  )
}

// --- Project ---------------------------------------------------------------------------------

const NEW_PROJECT: Project = {
  id: "",
  name: "",
  description: "",
  start: null,
  end: null,
  current: false,
  url: "",
  associatedWith: null,
  skills: [],
  media: [],
}

export function ProjectDialog({ open, onOpenChange, entry, profile, onSave, onDelete }: EntryDialog<Project>) {
  const [d, setD] = useDraft(open, entry ?? NEW_PROJECT)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? "Modifica progetto" : "Aggiungi progetto"}
      canSave={!!d.name.trim()}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), end: d.current ? null : d.end })}
    >
      <FormGroup title="Progetto">
        <Field label="Nome del progetto" required>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Descrizione" hint="Cosa fa, il tuo ruolo e un numero che ne misura il risultato.">
          <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-24" />
        </Field>
        <Field label="Link">
          <Input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://github.com/…" className="font-mono text-xs" />
        </Field>
        <Field label="Associato a" hint="Il lavoro o il percorso di studi in cui l'hai realizzato.">
          <Select value={d.associatedWith ?? NONE} onValueChange={(v) => setD({ ...d, associatedWith: v === NONE ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={NONE}>Progetto personale</SelectItem>
              {profile.experiences.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Esperienze</SelectLabel>
                  {profile.experiences.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.role} · {e.company}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {profile.education.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Formazione</SelectLabel>
                  {profile.education.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.degree || e.school} · {e.school}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </Field>
      </FormGroup>

      <FormGroup title="Periodo">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.current} onCheckedChange={(c) => setD({ ...d, current: c })} />
          Ci sto ancora lavorando
        </label>
        <div className="grid grid-cols-2 gap-3">
          <MonthYearField label="Data di inizio" value={d.start} onChange={(start) => setD({ ...d, start })} />
          <MonthYearField label="Data di fine" value={d.current ? null : d.end} disabled={d.current} onChange={(end) => setD({ ...d, end })} />
        </div>
      </FormGroup>

      <FormGroup title="Competenze">
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title="Contenuti multimediali">
        <MediaEditor value={d.media} onChange={(media) => setD({ ...d, media })} />
      </FormGroup>
    </FormDialog>
  )
}

// --- Removing a linked skill -----------------------------------------------------------------

export function RemoveSkillDialog({
  skill,
  uses,
  onOpenChange,
  onConfirm,
}: {
  skill: string | null
  uses: SkillUse[]
  onOpenChange: (o: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={!!skill} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rimuovere «{skill}»?</DialogTitle>
          <DialogDescription>
            {uses.length === 1 ? "È collegata a una voce del profilo" : `È collegata a ${uses.length} voci del profilo`}: la togliamo
            anche da lì.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {uses.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate">{u.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground capitalize">{u.section}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            Rimuovi ovunque
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
