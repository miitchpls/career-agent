import { useRef, useState } from "react"
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  AwardIcon,
  BriefcaseIcon,
  CameraIcon,
  CheckIcon,
  FolderGitIcon,
  GraduationCapIcon,
  LanguagesIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { MediaStrip, SkillLine } from "@/components/profile/fields"
import {
  CertificationDialog,
  EducationDialog,
  ExperienceDialog,
  IdentityDialog,
  LanguageDialog,
  ProjectDialog,
  RemoveSkillDialog,
  SummaryDialog,
} from "@/components/profile/profile-dialogs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  completeness,
  fmtMonthYear,
  fmtRange,
  isCefr,
  levelLabel,
  profileStore,
  removeSkill,
  reviewCount,
  skillUses,
  upsert,
  useProfile,
  withSkills,
  type Certification,
  type Education,
  type Experience,
  type Language,
  type Profile,
  type Project,
} from "@/lib/profile-mock"
import { cn } from "@/lib/utils"

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?"

type Change = (p: Profile) => void
/** Which entry a section's dialog shows: an existing one, a new one, or none. */
type Editing<T> = T | "new" | null

function useEditing<T>() {
  const [editing, setEditing] = useState<Editing<T>>(null)
  return {
    editing,
    entry: editing === "new" ? null : editing,
    open: editing !== null,
    edit: (e: T) => setEditing(e),
    add: () => setEditing("new"),
    onOpenChange: (o: boolean) => !o && setEditing(null),
  }
}

export function ProfileView() {
  const { profile, stage, source } = useProfile()
  const pending = reviewCount(profile)
  const update = profileStore.update

  return (
    <div className="space-y-4">
      <AnimatePresence>{stage === "review" && <ReviewBanner pending={pending} source={source} />}</AnimatePresence>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-4">
          <Identity profile={profile} onChange={update} />
          <Summary profile={profile} onChange={update} />
          <Experiences profile={profile} onChange={update} />
          <EducationSection profile={profile} onChange={update} />
          <Skills profile={profile} onChange={update} />
          <LanguagesSection profile={profile} onChange={update} />
          <ProjectsSection profile={profile} onChange={update} />
          <Certifications profile={profile} onChange={update} />
        </div>
        <Aside profile={profile} />
      </div>
    </div>
  )
}

function ReviewBanner({ pending, source }: { pending: number; source: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-50/90 px-4 py-3 backdrop-blur dark:bg-amber-950/60"
    >
      <AlertTriangleIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{pending === 1 ? "1 campo da verificare" : `${pending} campi da verificare`}</span>
        <span className="text-muted-foreground"> · importati da {source}. Controllali prima di generare un CV.</span>
      </div>
      <Button size="sm" onClick={profileStore.confirmAll}>
        <CheckIcon />
        Conferma tutto
      </Button>
    </motion.div>
  )
}

function Section({
  icon: Icon,
  title,
  count,
  action,
  children,
}: {
  icon: typeof BriefcaseIcon
  title: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">{title}</h2>
        {!!count && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        <div className="ml-auto flex items-center gap-1">{action}</div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <PlusIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      onClick={onClick}
    >
      <PencilIcon />
    </Button>
  )
}

function EmptyHint({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <PlusIcon className="size-3.5" />
      {children}
    </button>
  )
}

/** Amber frame around imported data the user hasn't confirmed yet. */
function ReviewFrame({
  note,
  onConfirm,
  onEdit,
  children,
}: {
  note?: string
  onConfirm: () => void
  onEdit: () => void
  children: React.ReactNode
}) {
  if (!note) return <>{children}</>
  return (
    <div className="-mx-3 rounded-lg bg-amber-500/5 p-3 ring-1 ring-amber-500/25">
      {children}
      <div className="mt-3 flex items-center gap-2 border-t border-amber-500/20 pt-2.5">
        <span className="size-1.5 rounded-full bg-amber-500" />
        <span className="flex-1 text-xs text-amber-700 dark:text-amber-300">{note}</span>
        <Button variant="ghost" size="xs" onClick={onEdit}>
          Modifica
        </Button>
        <Button variant="outline" size="xs" onClick={onConfirm}>
          <CheckIcon />
          Va bene
        </Button>
      </div>
    </div>
  )
}

/** Square mark beside an entry: company initials, or the section's icon. */
function Mark({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/50 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  )
}

// --- Identity --------------------------------------------------------------------------------

/** The avatar is the photo picker: hover shows a camera, click opens the system file dialog. */
function Photo({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={p.photo ? "Cambia foto" : "Aggiungi foto"}
        className="group/photo relative block shrink-0 self-start rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar className="size-24 border shadow-xs transition-transform duration-300 ease-out group-hover/photo:scale-[1.04]">
          {p.photo && <AvatarImage src={p.photo} alt="" className="object-cover" />}
          <AvatarFallback className="text-2xl font-medium">{initials(p.name)}</AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex scale-95 flex-col items-center justify-center gap-0.5 rounded-full bg-black/60 text-white opacity-0 backdrop-blur-[2px] transition-all duration-300 ease-out group-hover/photo:scale-100 group-hover/photo:opacity-100 group-focus-visible/photo:scale-100 group-focus-visible/photo:opacity-100">
          <CameraIcon className="size-4 transition-transform duration-300 group-hover/photo:-translate-y-0.5" />
          <span className="text-[10px] font-medium">{p.photo ? "Cambia" : "Aggiungi"}</span>
        </span>
        {!p.photo && (
          <span className="absolute right-0.5 bottom-0.5 grid size-7 place-items-center rounded-full border-2 border-card bg-foreground text-background transition-opacity group-hover/photo:opacity-0">
            <PlusIcon className="size-3" />
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChange({ ...p, photo: URL.createObjectURL(f) })
          e.target.value = ""
        }}
      />
    </>
  )
}

function Identity({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const [edit, setEdit] = useState(false)
  const blank = !p.name
  return (
    <Card className="relative flex-row items-center gap-5 px-5 py-5">
      <Photo profile={p} onChange={onChange} />
      <div className="min-w-0 flex-1 space-y-2 pr-24">
        {blank ? (
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight text-muted-foreground">Il tuo nome</p>
            <p className="text-sm text-muted-foreground">Aggiungi nome, titolo e contatti per iniziare.</p>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{p.name}</h2>
              <p className="text-sm">{p.headline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {p.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="size-3.5" />
                  {p.location}
                </span>
              )}
              {p.email && (
                <span className="inline-flex items-center gap-1.5">
                  <MailIcon className="size-3.5" />
                  {p.email}
                </span>
              )}
            </div>
            {p.links.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {p.links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    title={l.url}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
                  >
                    {l.label || l.url.replace(/^https?:\/\//, "")}
                    <ArrowUpRightIcon className="size-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <Button variant="outline" size="sm" className="absolute top-5 right-5" onClick={() => setEdit(true)}>
        <PencilIcon />
        Modifica
      </Button>
      <IdentityDialog open={edit} onOpenChange={setEdit} profile={p} onSave={onChange} />
    </Card>
  )
}

function Summary({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const [edit, setEdit] = useState(false)
  return (
    <Section
      icon={SparklesIcon}
      title="Riepilogo"
      action={
        p.summary && (
          <Button variant="ghost" size="icon-sm" aria-label="Modifica riepilogo" onClick={() => setEdit(true)}>
            <PencilIcon />
          </Button>
        )
      }
    >
      {p.summary ? (
        <p className="text-sm leading-relaxed text-pretty">{p.summary}</p>
      ) : (
        <EmptyHint onClick={() => setEdit(true)}>Scrivi due righe su di te</EmptyHint>
      )}
      <SummaryDialog open={edit} onOpenChange={setEdit} profile={p} onSave={onChange} />
    </Section>
  )
}

// --- Entries ---------------------------------------------------------------------------------

function Experiences({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const ed = useEditing<Experience>()
  const save = (e: Experience) => onChange(withSkills({ ...p, experiences: upsert(p.experiences, e) }, e.skills))

  return (
    <Section icon={BriefcaseIcon} title="Esperienze" count={p.experiences.length} action={<AddButton label="Aggiungi esperienza" onClick={ed.add} />}>
      {p.experiences.length === 0 ? (
        <EmptyHint onClick={ed.add}>Aggiungi la tua prima esperienza</EmptyHint>
      ) : (
        <ol className="space-y-5">
          {p.experiences.map((e, i) => (
            <li key={e.id} className="group relative flex gap-3">
              {i < p.experiences.length - 1 && (
                <span className="absolute top-11 bottom-[-1.25rem] left-[1.1875rem] w-px bg-border" aria-hidden />
              )}
              <Mark>{initials(e.company)}</Mark>
              <div className="min-w-0 flex-1">
                <ReviewFrame note={e.review} onConfirm={() => save({ ...e, review: undefined })} onEdit={() => ed.edit(e)}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.role}</p>
                      <p className="text-sm text-muted-foreground">
                        {[e.company, e.employment].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{fmtRange(e.start, e.end, e.current)}</p>
                      {(e.location || e.locationType) && (
                        <p className="text-xs text-muted-foreground">{[e.location, e.locationType].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <EditButton label="Modifica esperienza" onClick={() => ed.edit(e)} />
                  </div>
                  {e.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {e.bullets.map((b) => (
                        <li key={b} className="flex gap-2 text-sm text-pretty">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  <SkillLine skills={e.skills} />
                  <MediaStrip media={e.media} />
                </ReviewFrame>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ExperienceDialog
        open={ed.open}
        onOpenChange={ed.onOpenChange}
        entry={ed.entry}
        profile={p}
        onSave={save}
        onDelete={(e) => onChange({ ...p, experiences: p.experiences.filter((x) => x.id !== e.id) })}
      />
    </Section>
  )
}

function EducationSection({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const ed = useEditing<Education>()
  const save = (e: Education) => onChange(withSkills({ ...p, education: upsert(p.education, e) }, e.skills))

  return (
    <Section icon={GraduationCapIcon} title="Formazione" count={p.education.length} action={<AddButton label="Aggiungi formazione" onClick={ed.add} />}>
      {p.education.length === 0 ? (
        <EmptyHint onClick={ed.add}>Aggiungi un titolo di studio</EmptyHint>
      ) : (
        <ul className="space-y-5">
          {p.education.map((d) => (
            <li key={d.id} className="group flex gap-3">
              <Mark>
                <GraduationCapIcon className="size-4" />
              </Mark>
              <div className="min-w-0 flex-1">
                <ReviewFrame note={d.review} onEdit={() => ed.edit(d)} onConfirm={() => save({ ...d, review: undefined })}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{d.school}</p>
                      <p className="text-sm text-muted-foreground">{[d.degree, d.field].filter(Boolean).join(", ")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {[fmtMonthYear(d.start), fmtMonthYear(d.end)].filter(Boolean).join(" – ")}
                      </p>
                      {d.grade && <p className="text-xs text-muted-foreground">Votazione: {d.grade}</p>}
                    </div>
                    <EditButton label="Modifica formazione" onClick={() => ed.edit(d)} />
                  </div>
                  {d.activities && (
                    <p className="mt-2 text-sm text-pretty">
                      <span className="text-muted-foreground">Attività e associazioni: </span>
                      {d.activities}
                    </p>
                  )}
                  {d.description && <p className="mt-1.5 text-sm text-pretty">{d.description}</p>}
                  <SkillLine skills={d.skills} />
                  <MediaStrip media={d.media} />
                </ReviewFrame>
              </div>
            </li>
          ))}
        </ul>
      )}
      <EducationDialog
        open={ed.open}
        onOpenChange={ed.onOpenChange}
        entry={ed.entry}
        profile={p}
        onSave={save}
        onDelete={(e) => onChange({ ...p, education: p.education.filter((x) => x.id !== e.id) })}
      />
    </Section>
  )
}

function Skills({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const [draft, setDraft] = useState("")
  const [removing, setRemoving] = useState<string | null>(null)
  const inferred = p.skills.filter((s) => s.inferred).length
  const add = () => {
    const name = draft.trim()
    if (name) onChange(withSkills(p, [name]))
    setDraft("")
  }
  const remove = (name: string) => (skillUses(p, name).length ? setRemoving(name) : onChange(removeSkill(p, name)))

  return (
    <Section icon={WrenchIcon} title="Competenze" count={p.skills.length}>
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {p.skills.map((s) => {
            const uses = skillUses(p, s.name)
            return (
              <motion.span
                key={s.name}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                className={cn(
                  "group inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-2.5 text-xs",
                  s.inferred && "border-dashed border-amber-500/50 bg-amber-500/5",
                )}
              >
                {s.name}
                {uses.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="grid h-4 min-w-4 cursor-default place-items-center rounded-full bg-secondary px-1 text-[10px] text-muted-foreground tabular-nums">
                        {uses.length}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="mb-1 font-medium">Usata in</p>
                      {uses.map((u) => (
                        <p key={u.id}>{u.label}</p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                )}
                {s.inferred && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Conferma ${s.name}`}
                        className="grid size-5 place-items-center rounded-full text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
                        onClick={() => onChange({ ...p, skills: p.skills.map((x) => (x.name === s.name ? { name: x.name } : x)) })}
                      >
                        <CheckIcon className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Dedotta dal testo: confermala</TooltipContent>
                  </Tooltip>
                )}
                <button
                  type="button"
                  aria-label={`Rimuovi ${s.name}`}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  onClick={() => remove(s.name)}
                >
                  <XIcon className="size-3" />
                </button>
              </motion.span>
            )
          })}
        </AnimatePresence>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onBlur={add}
          placeholder="+ Aggiungi"
          className="h-7 w-28 rounded-full border-dashed px-2.5 text-xs shadow-none"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Il numero indica in quante voci del profilo la usi.
        {inferred > 0 && " Quelle tratteggiate sono dedotte dal testo: confermale solo se le sai usare davvero."}
      </p>
      <RemoveSkillDialog
        skill={removing}
        uses={removing ? skillUses(p, removing) : []}
        onOpenChange={(o) => !o && setRemoving(null)}
        onConfirm={() => removing && onChange(removeSkill(p, removing))}
      />
    </Section>
  )
}

function LanguagesSection({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const ed = useEditing<Language>()
  return (
    <Section icon={LanguagesIcon} title="Lingue" count={p.languages.length} action={<AddButton label="Aggiungi lingua" onClick={ed.add} />}>
      {p.languages.length === 0 ? (
        <EmptyHint onClick={ed.add}>Aggiungi una lingua</EmptyHint>
      ) : (
        <ul className="divide-y">
          {p.languages.map((l) => (
            <li key={l.id} className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{l.name}</p>
                {l.certificate && <p className="text-xs text-muted-foreground">{l.certificate}</p>}
              </div>
              <Badge variant="secondary" className={cn(isCefr(l.level) && "font-mono")}>
                {levelLabel(l.level)}
              </Badge>
              <EditButton label={`Modifica ${l.name}`} onClick={() => ed.edit(l)} />
            </li>
          ))}
        </ul>
      )}
      <LanguageDialog
        open={ed.open}
        onOpenChange={ed.onOpenChange}
        entry={ed.entry}
        profile={p}
        onSave={(l) => onChange({ ...p, languages: upsert(p.languages, l) })}
        onDelete={(l) => onChange({ ...p, languages: p.languages.filter((x) => x.id !== l.id) })}
      />
    </Section>
  )
}

function ProjectsSection({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const ed = useEditing<Project>()
  const save = (x: Project) => onChange(withSkills({ ...p, projects: upsert(p.projects, x) }, x.skills))
  const owner = (id: string | null) =>
    id && (p.experiences.find((e) => e.id === id)?.company ?? p.education.find((e) => e.id === id)?.school)

  return (
    <Section icon={FolderGitIcon} title="Progetti" count={p.projects.length} action={<AddButton label="Aggiungi progetto" onClick={ed.add} />}>
      {p.projects.length === 0 ? (
        <EmptyHint onClick={ed.add}>Aggiungi un progetto</EmptyHint>
      ) : (
        <ul className="space-y-5">
          {p.projects.map((x) => (
            <li key={x.id} className="group flex gap-3">
              <Mark>
                <FolderGitIcon className="size-4" />
              </Mark>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{x.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {[fmtRange(x.start, x.end, x.current), owner(x.associatedWith) && `con ${owner(x.associatedWith)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <EditButton label="Modifica progetto" onClick={() => ed.edit(x)} />
                </div>
                {x.description && <p className="mt-1.5 text-sm text-pretty">{x.description}</p>}
                {x.url && (
                  <a
                    href={x.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
                  >
                    Mostra il progetto
                    <ArrowUpRightIcon className="size-3 text-muted-foreground" />
                  </a>
                )}
                <SkillLine skills={x.skills} />
                <MediaStrip media={x.media} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ProjectDialog
        open={ed.open}
        onOpenChange={ed.onOpenChange}
        entry={ed.entry}
        profile={p}
        onSave={save}
        onDelete={(x) => onChange({ ...p, projects: p.projects.filter((y) => y.id !== x.id) })}
      />
    </Section>
  )
}

function Certifications({ profile: p, onChange }: { profile: Profile; onChange: Change }) {
  const ed = useEditing<Certification>()
  const save = (c: Certification) => onChange(withSkills({ ...p, certifications: upsert(p.certifications, c) }, c.skills))

  return (
    <Section
      icon={AwardIcon}
      title="Licenze e certificazioni"
      count={p.certifications.length}
      action={<AddButton label="Aggiungi certificazione" onClick={ed.add} />}
    >
      {p.certifications.length === 0 ? (
        <EmptyHint onClick={ed.add}>Aggiungi una certificazione</EmptyHint>
      ) : (
        <ul className="space-y-5">
          {p.certifications.map((c) => (
            <li key={c.id} className="group flex gap-3">
              <Mark>{initials(c.issuer)}</Mark>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{c.issuer}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {[c.issued && `Rilasciata ${fmtMonthYear(c.issued)}`, c.expires && `scade ${fmtMonthYear(c.expires)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {c.credentialId && <p className="font-mono text-[11px] text-muted-foreground">ID {c.credentialId}</p>}
                  </div>
                  <EditButton label="Modifica certificazione" onClick={() => ed.edit(c)} />
                </div>
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
                  >
                    Mostra credenziale
                    <ArrowUpRightIcon className="size-3 text-muted-foreground" />
                  </a>
                )}
                <SkillLine skills={c.skills} />
                <MediaStrip media={c.media} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <CertificationDialog
        open={ed.open}
        onOpenChange={ed.onOpenChange}
        entry={ed.entry}
        profile={p}
        onSave={save}
        onDelete={(c) => onChange({ ...p, certifications: p.certifications.filter((x) => x.id !== c.id) })}
      />
    </Section>
  )
}

// --- Sidebar ---------------------------------------------------------------------------------

function Aside({ profile }: { profile: Profile }) {
  const { score, missing } = completeness(profile)
  const { generated } = useProfile()
  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <Card className="gap-3 px-5 py-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Completezza</h2>
          <span className="font-mono text-sm tabular-nums">{score}%</span>
        </div>
        <Progress value={score} className="h-1.5" />
        {missing.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Per CV migliori aggiungi:</p>
            <ul className="space-y-1">
              {missing.slice(0, 4).map((m) => (
                <li key={m} className="flex items-center gap-2 text-xs">
                  <span className="size-1 rounded-full bg-muted-foreground" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Il profilo è completo.</p>
        )}
      </Card>

      <Card className="gap-3 px-5 py-4">
        <h2 className="text-sm font-medium">Preferenze del CV</h2>
        <Pref label="Lingua" defaultValue="job" options={[["job", "Quella dell'annuncio"], ["it", "Italiano"], ["en", "Inglese"], ["de", "Tedesco"]]} />
        <Pref label="Formato" defaultValue="auto" options={[["auto", "Automatico"], ["a4", "A4"], ["letter", "Letter"]]} />
        <Pref label="Modello" defaultValue="modern" options={[["modern", "Moderno"], ["classic", "Classico"], ["compact", "Compatto"]]} />
        <Pref label="Foto nel CV" defaultValue="auto" options={[["auto", "Dove si usa"], ["always", "Sempre"], ["never", "Mai"]]} />
      </Card>

      <Card className="gap-2 px-5 py-4">
        <h2 className="text-sm font-medium">Generazione</h2>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Chiave API</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            impostata
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Modello</span>
          <span className="font-mono">claude-sonnet-5-5</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">CV generati</span>
          <span className="tabular-nums">{generated.size}</span>
        </div>
      </Card>
    </aside>
  )
}

function Pref({ label, defaultValue, options }: { label: string; defaultValue: string; options: [string, string][] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>
      <Select defaultValue={defaultValue}>
        <SelectTrigger size="sm" className="h-7 w-40 text-xs">
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
    </div>
  )
}
