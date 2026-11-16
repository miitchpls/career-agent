import { useState } from "react"
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  AwardIcon,
  BriefcaseIcon,
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

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ExperienceDialog, IdentityDialog, SummaryDialog } from "@/components/profile/profile-dialogs"
import { completeness, profileStore, reviewCount, useProfile, type Experience, type Profile } from "@/lib/profile-mock"
import { cn } from "@/lib/utils"

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?"

export function ProfileView() {
  const { profile, stage, source } = useProfile()
  const pending = reviewCount(profile)
  const update = (p: Profile) => profileStore.confirm(p)

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
          <div className="grid gap-4 md:grid-cols-2">
            <LanguagesSection profile={profile} />
            <ProjectsSection profile={profile} />
          </div>
          <Certifications profile={profile} />
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
        <span className="font-medium">
          {pending === 1 ? "1 campo da verificare" : `${pending} campi da verificare`}
        </span>
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

function AddButton({ label, onClick }: { label: string; onClick?: () => void }) {
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

function EmptyHint({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
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

function Identity({ profile: p, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const [edit, setEdit] = useState(false)
  const blank = !p.name
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {/* Cover: a quiet dotted grid fading out, Vercel-style, no stock imagery. */}
      <div className="relative h-24 border-b bg-muted/40">
        <div className="absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>
      <div className="relative px-5 pb-5">
        <Avatar className="-mt-10 size-20 border-4 border-card shadow-sm">
          <AvatarFallback className="text-xl font-medium">{initials(p.name)}</AvatarFallback>
        </Avatar>
        <Button variant="outline" size="sm" className="absolute top-3 right-5" onClick={() => setEdit(true)}>
          <PencilIcon />
          Modifica
        </Button>
        {blank ? (
          <div className="mt-3 space-y-1">
            <p className="text-lg font-semibold tracking-tight text-muted-foreground">Il tuo nome</p>
            <p className="text-sm text-muted-foreground">Aggiungi nome, titolo e contatti per iniziare.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
              <p className="text-sm">{p.headline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" />
                {p.location}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MailIcon className="size-3.5" />
                {p.email}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {p.links.map((l) => (
                <a
                  key={l.label}
                  href={l.url}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors hover:bg-muted"
                >
                  {l.label}
                  <ArrowUpRightIcon className="size-3 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      <IdentityDialog open={edit} onOpenChange={setEdit} profile={p} onSave={onChange} />
    </Card>
  )
}

function Summary({ profile: p, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
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

function Experiences({ profile: p, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const [editing, setEditing] = useState<Experience | "new" | null>(null)
  const save = (e: Experience) =>
    onChange({
      ...p,
      experiences: p.experiences.some((x) => x.id === e.id)
        ? p.experiences.map((x) => (x.id === e.id ? e : x))
        : [e, ...p.experiences],
    })

  return (
    <Section
      icon={BriefcaseIcon}
      title="Esperienze"
      count={p.experiences.length}
      action={<AddButton label="Aggiungi esperienza" onClick={() => setEditing("new")} />}
    >
      {p.experiences.length === 0 ? (
        <EmptyHint onClick={() => setEditing("new")}>Aggiungi la tua prima esperienza</EmptyHint>
      ) : (
        <ol className="space-y-5">
          {p.experiences.map((e, i) => (
            <li key={e.id} className="group relative flex gap-3">
              {/* Timeline rail between company marks. */}
              {i < p.experiences.length - 1 && (
                <span className="absolute top-11 bottom-[-1.25rem] left-[1.1875rem] w-px bg-border" aria-hidden />
              )}
              <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/50 text-xs font-medium text-muted-foreground">
                {initials(e.company)}
              </div>
              <div className="min-w-0 flex-1">
                <ReviewFrame
                  note={e.review}
                  onConfirm={() => save({ ...e, review: undefined })}
                  onEdit={() => setEditing(e)}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.role}</p>
                      <p className="text-sm text-muted-foreground">
                        {e.company} · {e.place}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {e.start} – {e.end ?? "oggi"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Modifica esperienza"
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => setEditing(e)}
                    >
                      <PencilIcon />
                    </Button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {e.bullets.map((b) => (
                      <li key={b} className="flex gap-2 text-sm text-pretty">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </ReviewFrame>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ExperienceDialog
        experience={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={save}
      />
    </Section>
  )
}

function EducationSection({ profile: p, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  return (
    <Section
      icon={GraduationCapIcon}
      title="Formazione"
      count={p.education.length}
      action={<AddButton label="Aggiungi formazione" />}
    >
      {p.education.length === 0 ? (
        <EmptyHint>Aggiungi un titolo di studio</EmptyHint>
      ) : (
        <ul className="space-y-4">
          {p.education.map((d) => (
            <li key={d.id} className="flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/50">
                <GraduationCapIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <ReviewFrame
                  note={d.review}
                  onEdit={() => {}}
                  onConfirm={() =>
                    onChange({
                      ...p,
                      education: p.education.map((x) => (x.id === d.id ? { ...x, review: undefined } : x)),
                    })
                  }
                >
                  <p className="text-sm font-medium">{d.school}</p>
                  <p className="text-sm text-muted-foreground">{d.degree}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{d.years}</p>
                </ReviewFrame>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Skills({ profile: p, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const [draft, setDraft] = useState("")
  const inferred = p.skills.filter((s) => s.inferred).length
  const add = () => {
    const name = draft.trim()
    if (name && !p.skills.some((s) => s.name.toLowerCase() === name.toLowerCase()))
      onChange({ ...p, skills: [...p.skills, { name }] })
    setDraft("")
  }
  const setSkills = (skills: Profile["skills"]) => onChange({ ...p, skills })

  return (
    <Section icon={WrenchIcon} title="Competenze" count={p.skills.length}>
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {p.skills.map((s) => (
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
              {s.inferred ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Conferma ${s.name}`}
                        className="grid size-5 place-items-center rounded-full text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
                        onClick={() => setSkills(p.skills.map((x) => (x.name === s.name ? { name: x.name } : x)))}
                      >
                        <CheckIcon className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Dedotta dal testo: confermala</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
              <button
                type="button"
                aria-label={`Rimuovi ${s.name}`}
                className="grid size-5 place-items-center rounded-full text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100 hover:bg-muted"
                onClick={() => setSkills(p.skills.filter((x) => x.name !== s.name))}
              >
                <XIcon className="size-3" />
              </button>
            </motion.span>
          ))}
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
      {inferred > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Quelle tratteggiate sono dedotte dal testo e non scritte nel CV: confermale solo se le sai usare davvero.
        </p>
      )}
    </Section>
  )
}

function LanguagesSection({ profile: p }: { profile: Profile }) {
  return (
    <Section icon={LanguagesIcon} title="Lingue" action={<AddButton label="Aggiungi lingua" />}>
      {p.languages.length === 0 ? (
        <EmptyHint>Aggiungi una lingua</EmptyHint>
      ) : (
        <ul className="divide-y">
          {p.languages.map((l) => (
            <li key={l.name} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
              {l.name}
              <Badge variant="secondary" className="font-mono">
                {l.level}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function ProjectsSection({ profile: p }: { profile: Profile }) {
  return (
    <Section icon={FolderGitIcon} title="Progetti" action={<AddButton label="Aggiungi progetto" />}>
      {p.projects.length === 0 ? (
        <EmptyHint>Aggiungi un progetto</EmptyHint>
      ) : (
        <ul className="space-y-3">
          {p.projects.map((x) => (
            <li key={x.id}>
              <a href={x.url} className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                {x.name}
                <ArrowUpRightIcon className="size-3 text-muted-foreground" />
              </a>
              <p className="text-sm text-muted-foreground">{x.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Certifications({ profile: p }: { profile: Profile }) {
  return (
    <Section icon={AwardIcon} title="Certificazioni" action={<AddButton label="Aggiungi certificazione" />}>
      {p.certifications.length === 0 ? (
        <EmptyHint>Aggiungi una certificazione</EmptyHint>
      ) : (
        <ul className="space-y-1">
          {p.certifications.map((c) => (
            <li key={c} className="text-sm">
              {c}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

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
      <span className="text-xs text-muted-foreground">{label}</span>
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
