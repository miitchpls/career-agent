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
import { useT } from "@/lib/i18n"
import { useDraft } from "@/lib/use-draft"
import {
  CEFR,
  EMPLOYMENT,
  LOCATION_TYPES,
  PROFICIENCY,
  endsBefore,
  uid,
  type Certification,
  type Education,
  type Experience,
  type Language,
  type LanguageLevel,
  type Profile,
  type Project,
  type SkillUse,
} from "@/lib/profile"

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
  const all = useT()
  const t = all.profile
  const [d, setD] = useDraft(open, profile)
  const text = (k: "name" | "headline" | "location" | "email") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })
  const setLink = (id: string, patch: Partial<Profile["links"][number]>) =>
    setD({ ...d, links: d.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.identity}
      canSave={!!d.name.trim()}
      onSave={() => onSave({ ...d, links: d.links.filter((l) => l.url.trim()) })}
    >
      <FormGroup title={t.whoYouAre}>
        <Field label={t.fullName} required>
          <Input value={d.name} onChange={text("name")} />
        </Field>
        <Field label={t.headline} hint={t.headlineHint}>
          <Input value={d.headline} onChange={text("headline")} placeholder="Backend Engineer · Python" />
        </Field>
      </FormGroup>

      <FormGroup title={t.contacts}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.city}>
            <Input value={d.location} onChange={text("location")} />
          </Field>
          <Field label={t.email}>
            <Input type="email" value={d.email} onChange={text("email")} />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title={t.links} description={t.linksHint}>
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
                  placeholder={t.linkTitle}
                  aria-label={t.linkTitleAria}
                  className="w-36 shrink-0"
                />
                <Input
                  value={l.url}
                  onChange={(e) => setLink(l.id, { url: e.target.value })}
                  placeholder="https://"
                  aria-label={t.linkUrlAria}
                  className="font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.removeLink}
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
          {t.addLink}
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
  const all = useT()
  const t = all.profile
  const [text, setText] = useDraft(open, profile.summary)
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t.summary}
      description={t.summaryHint}
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
  const all = useT()
  const t = all.profile
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
      title={entry ? t.editExperience : t.addExperience}
      canSave={!!d.role.trim() && !!d.company.trim() && !!d.start && !(!d.current && endsBefore(d.start, d.end))}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() =>
        onSave({
          ...d,
          id: d.id || uid(),
          review: null,
          end: d.current ? null : d.end,
          bullets: bullets
            .split("\n")
            .map((b) => b.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean),
        })
      }
    >
      <FormGroup title={t.role}>
        <Field label={t.jobTitle} required>
          <Input value={d.role} onChange={text("role")} placeholder="Backend Engineer" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.company} required>
            <Input value={d.company} onChange={text("company")} />
          </Field>
          <Field label={t.employmentType}>
            <Select
              value={d.employment ?? NONE}
              onValueChange={(v) => setD({ ...d, employment: v === NONE ? null : (v as Experience["employment"]) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.select} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NONE}>{t.notStated}</SelectItem>
                {EMPLOYMENT.map((e) => (
                  <SelectItem key={e} value={e}>
                    {t.employment[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.location}>
            <Input value={d.location} onChange={text("location")} placeholder={t.locationPlaceholder} />
          </Field>
          <Field label={t.locationTypeLabel}>
            <Select
              value={d.locationType ?? NONE}
              onValueChange={(v) => setD({ ...d, locationType: v === NONE ? null : (v as Experience["locationType"]) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.select} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NONE}>{t.notStated}</SelectItem>
                {LOCATION_TYPES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {t.locationType[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormGroup>

      <FormGroup title={t.period}>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.current} onCheckedChange={(c) => setD({ ...d, current: c })} />
          {t.currentRole}
        </label>
        <div className="grid grid-cols-2 items-start gap-3">
          <MonthYearField label={t.startDate} required value={d.start} onChange={(start) => setD({ ...d, start })} />
          <MonthYearField
            label={t.endDate}
            value={d.current ? null : d.end}
            disabled={d.current}
            onChange={(end) => setD({ ...d, end })}
            error={!d.current && endsBefore(d.start, d.end) ? t.endBeforeStart : null}
          />
        </div>
      </FormGroup>

      <FormGroup title={t.whatYouDid}>
        <Field label={t.results} hint={t.resultsHint}>
          <Textarea value={bullets} onChange={(e) => setBullets(e.target.value)} className="min-h-32" />
        </Field>
      </FormGroup>

      <FormGroup title={t.skills} description={t.experienceSkillsHint}>
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title={t.media} description={t.mediaHint}>
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
  const all = useT()
  const t = all.profile
  const [d, setD] = useDraft(open, entry ?? NEW_EDUCATION)
  const text = (k: "school" | "degree" | "field" | "grade") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? t.editEducation : t.addEducation}
      canSave={!!d.school.trim() && !endsBefore(d.start, d.end)}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), review: null })}
    >
      <FormGroup title={t.course}>
        <Field label={t.school} required>
          <Input value={d.school} onChange={text("school")} placeholder={t.schoolPlaceholder} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.degree}>
            <Input value={d.degree} onChange={text("degree")} placeholder={t.degreePlaceholder} />
          </Field>
          <Field label={t.field}>
            <Input value={d.field} onChange={text("field")} placeholder={t.fieldPlaceholder} />
          </Field>
        </div>
        <div className="grid grid-cols-2 items-start gap-3">
          <MonthYearField label={t.startDate} value={d.start} onChange={(start) => setD({ ...d, start })} />
          <MonthYearField
            label={t.endDateExpected}
            value={d.end}
            onChange={(end) => setD({ ...d, end })}
            error={endsBefore(d.start, d.end) ? t.endBeforeStart : null}
          />
        </div>
        <Field label={t.grade} className="w-1/2 pr-1.5">
          <Input value={d.grade} onChange={text("grade")} placeholder={t.gradePlaceholder} />
        </Field>
      </FormGroup>

      <FormGroup title={t.details}>
        <Field label={t.activities} hint={t.activitiesHint}>
          <Textarea value={d.activities} onChange={(e) => setD({ ...d, activities: e.target.value })} className="min-h-16" />
        </Field>
        <Field label={t.description} hint={t.educationDescriptionHint}>
          <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-24" />
        </Field>
      </FormGroup>

      <FormGroup title={t.skills}>
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title={t.media}>
        <MediaEditor value={d.media} onChange={(media) => setD({ ...d, media })} />
      </FormGroup>
    </FormDialog>
  )
}

// --- Language --------------------------------------------------------------------------------

const NEW_LANGUAGE: Language = { id: "", name: "", level: "professional", certificate: "" }

export function LanguageDialog({ open, onOpenChange, entry, profile, onSave, onDelete }: EntryDialog<Language>) {
  const all = useT()
  const t = all.profile
  const [d, setD] = useDraft(open, entry ?? NEW_LANGUAGE)
  const taken = new Set(profile.languages.map((l) => l.name))
  const cefr = (CEFR as readonly string[]).includes(d.level)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? t.editLanguage : t.addLanguage}
      canSave={!!d.name.trim()}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), certificate: cefr ? d.certificate : "" })}
    >
      <Field label={t.language} required>
        <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={t.languagePlaceholder} />
      </Field>
      {!entry && !d.name && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {t.languageSuggestions.filter((l) => !taken.has(l)).map((l) => (
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
        label={t.level}
        hint={cefr ? t.levelCefrHint : t.levelSelfHint}
      >
        <Select value={d.level} onValueChange={(v) => setD({ ...d, level: v as LanguageLevel })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectLabel>{t.noCertificate}</SelectLabel>
              {PROFICIENCY.map((k) => (
                <SelectItem key={k} value={k}>
                  {t.proficiency[k]}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t.cefr}</SelectLabel>
              {CEFR.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="font-mono">{c}</span>
                  <span className="text-muted-foreground">{t.cefrHint[c]}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <AnimatePresence initial={false}>
        {cefr && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Field label={t.certificate} hint={t.certificateHint}>
              <Input value={d.certificate} onChange={(e) => setD({ ...d, certificate: e.target.value })} />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </FormDialog>
  )
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
  const all = useT()
  const t = all.profile
  const [d, setD] = useDraft(open, entry ?? NEW_CERTIFICATION)
  const text = (k: "name" | "issuer" | "credentialId" | "url") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: e.target.value })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? t.editCertification : t.addCertification}
      canSave={!!d.name.trim() && !!d.issuer.trim() && !endsBefore(d.issued, d.expires)}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), review: null })}
    >
      <FormGroup title={t.certification}>
        <Field label={t.name} required>
          <Input value={d.name} onChange={text("name")} placeholder="AWS Certified Developer – Associate" />
        </Field>
        <Field label={t.issuer} required>
          <Input value={d.issuer} onChange={text("issuer")} placeholder="Amazon Web Services" />
        </Field>
        <div className="grid grid-cols-2 items-start gap-3">
          <MonthYearField label={t.issued} value={d.issued} onChange={(issued) => setD({ ...d, issued })} />
          <MonthYearField
            label={t.expires}
            value={d.expires}
            onChange={(expires) => setD({ ...d, expires })}
            error={endsBefore(d.issued, d.expires) ? t.expiresBeforeIssued : null}
          />
        </div>
      </FormGroup>

      <FormGroup title={t.verification} description={t.verificationHint}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.credentialId}>
            <Input value={d.credentialId} onChange={text("credentialId")} className="font-mono text-xs" />
          </Field>
          <Field label={t.credentialUrl}>
            <Input value={d.url} onChange={text("url")} placeholder="https://" className="font-mono text-xs" />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title={t.skills}>
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title={t.media}>
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
  const all = useT()
  const t = all.profile
  const [d, setD] = useDraft(open, entry ?? NEW_PROJECT)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={entry ? t.editProject : t.addProject}
      canSave={!!d.name.trim() && !(!d.current && endsBefore(d.start, d.end))}
      onDelete={entry ? () => onDelete(entry) : undefined}
      onSave={() => onSave({ ...d, id: d.id || uid(), review: null, end: d.current ? null : d.end })}
    >
      <FormGroup title={t.project}>
        <Field label={t.projectName} required>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label={t.description} hint={t.projectDescriptionHint}>
          <Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="min-h-24" />
        </Field>
        <Field label={t.link}>
          <Input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://github.com/…" className="font-mono text-xs" />
        </Field>
        <Field label={t.associatedWith} hint={t.associatedWithHint}>
          <Select value={d.associatedWith ?? NONE} onValueChange={(v) => setD({ ...d, associatedWith: v === NONE ? null : v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={NONE}>{t.personalProject}</SelectItem>
              {profile.experiences.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{t.experiences}</SelectLabel>
                  {profile.experiences.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.role} · {e.company}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {profile.education.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{t.educationGroup}</SelectLabel>
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

      <FormGroup title={t.period}>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.current} onCheckedChange={(c) => setD({ ...d, current: c })} />
          {t.stillWorking}
        </label>
        <div className="grid grid-cols-2 items-start gap-3">
          <MonthYearField label={t.startDate} value={d.start} onChange={(start) => setD({ ...d, start })} />
          <MonthYearField
            label={t.endDate}
            value={d.current ? null : d.end}
            disabled={d.current}
            onChange={(end) => setD({ ...d, end })}
            error={!d.current && endsBefore(d.start, d.end) ? t.endBeforeStart : null}
          />
        </div>
      </FormGroup>

      <FormGroup title={t.skills}>
        <SkillPicker value={d.skills} onChange={(skills) => setD({ ...d, skills })} known={known(profile)} />
      </FormGroup>

      <FormGroup title={t.media}>
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
  const all = useT()
  const t = all.profile
  return (
    <Dialog open={!!skill} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.removeSkillTitle(skill ?? "")}</DialogTitle>
          <DialogDescription>
            {t.linkedTo(uses.length)}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {uses.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate">{u.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground capitalize">{t.useSection[u.section]}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {all.common.cancel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {t.removeEverywhere}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
