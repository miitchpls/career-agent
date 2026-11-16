import { useEffect, useMemo, useState } from "react"
import {
  CheckIcon,
  CircleDashedIcon,
  DownloadIcon,
  FileUserIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Job } from "@/lib/api"
import { hasProfile, profileStore, tailoredFor, useProfile, type MatchKind } from "@/lib/profile-mock"
import { cn } from "@/lib/utils"

export type CvPhase = "idle" | "generating" | "done"

const STEPS = ["Leggo i requisiti dell'annuncio", "Li confronto con il tuo profilo", "Scrivo il CV", "Impagino il PDF"]

/** "CV per questa offerta" tab of the job sheet. Mock: no request leaves the browser. */
export function TailoredCv({
  job,
  phase,
  onGenerate,
  onDone,
  onOpenProfile,
}: {
  job: Job
  phase: CvPhase
  onGenerate: () => void
  onDone: () => void
  onOpenProfile: () => void
}) {
  const state = useProfile()
  if (!hasProfile(state)) return <NoProfile onOpenProfile={onOpenProfile} />
  if (phase === "idle") return <Idle onGenerate={onGenerate} pending={state.stage === "review"} onOpenProfile={onOpenProfile} />
  if (phase === "generating") return <Generating job={job} onDone={onDone} />
  return <Result job={job} onRegenerate={onGenerate} onOpenProfile={onOpenProfile} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">{children}</div>
}

function NoProfile({ onOpenProfile }: { onOpenProfile: () => void }) {
  return (
    <Centered>
      <div className="grid size-10 place-items-center rounded-lg border bg-background shadow-xs">
        <FileUserIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Prima serve il tuo profilo</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Il CV si scrive partendo da esperienze e competenze vere. Importa il tuo CV attuale: ci vuole un minuto.
        </p>
      </div>
      <Button size="sm" onClick={onOpenProfile}>
        Crea il profilo
      </Button>
    </Centered>
  )
}

function Idle({
  onGenerate,
  pending,
  onOpenProfile,
}: {
  onGenerate: () => void
  pending: boolean
  onOpenProfile: () => void
}) {
  return (
    <Centered>
      <div className="grid size-10 place-items-center rounded-lg border bg-background shadow-xs">
        <SparklesIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Un CV scritto per questa offerta</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Mettiamo in evidenza le esperienze che l'annuncio chiede e ti diciamo cosa manca. Non aggiungiamo nulla che
          non sia nel tuo profilo.
        </p>
      </div>
      <Button size="sm" onClick={onGenerate}>
        <SparklesIcon />
        Genera CV
      </Button>
      {pending && (
        <button type="button" onClick={onOpenProfile} className="text-xs text-amber-700 underline-offset-4 hover:underline dark:text-amber-300">
          Hai ancora campi del profilo da verificare
        </button>
      )}
    </Centered>
  )
}

function Generating({ job, onDone }: { job: Job; onDone: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= STEPS.length) {
      profileStore.markGenerated(job.url)
      const t = setTimeout(onDone, 300)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), 750)
    return () => clearTimeout(t)
  }, [step, job.url, onDone])

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-sm space-y-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: i <= step ? 1 : 0.4, x: 0 }}
            className="flex items-center gap-3 text-sm"
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full border",
                i < step && "border-foreground bg-foreground text-background",
              )}
            >
              {i < step ? <CheckIcon className="size-3" /> : i === step ? <LoaderCircleIcon className="size-3 animate-spin" /> : null}
            </span>
            {s}
          </motion.div>
        ))}
      </div>
      {/* Paper placeholder, so the result doesn't jump in from nowhere. */}
      <div className="mx-auto mt-8 aspect-[1/1.414] max-w-md animate-pulse rounded-md border bg-muted/40" />
    </div>
  )
}

const KIND: Record<MatchKind, { label: string; icon: typeof CheckIcon; cls: string }> = {
  have: { label: "Nel profilo", icon: CheckIcon, cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" },
  partial: { label: "In parte", icon: CircleDashedIcon, cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  gap: { label: "Manca", icon: XIcon, cls: "border-dashed text-muted-foreground" },
}

function Result({ job, onRegenerate, onOpenProfile }: { job: Job; onRegenerate: () => void; onOpenProfile: () => void }) {
  const cv = useMemo(() => tailoredFor(job.title, job.company), [job.title, job.company])
  const [marks, setMarks] = useState(true)
  const gaps = cv.matches.filter((m) => m.kind === "gap")
  const have = cv.matches.filter((m) => m.kind === "have").length

  return (
    <div className="space-y-6 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-xs text-muted-foreground">
          Versione {cv.version} · {cv.language} · {cv.format} · generato {cv.generatedAt}
        </div>
        <Button variant="ghost" size="sm" onClick={onRegenerate}>
          <RefreshCwIcon />
          Rigenera
        </Button>
        <Button size="sm" onClick={() => toast("PDF non ancora disponibile", { description: "È un'anteprima dell'interfaccia." })}>
          <DownloadIcon />
          Scarica PDF
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Cosa chiede l'annuncio</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {have} su {cv.matches.length} nel profilo
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cv.matches.map((m) => {
            const k = KIND[m.kind]
            return (
              <Tooltip key={m.skill}>
                <TooltipTrigger asChild>
                  <span className={cn("inline-flex h-6 cursor-default items-center gap-1 rounded-full border px-2 text-xs", k.cls)}>
                    <k.icon className="size-3" />
                    {m.skill}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {k.label}: {m.why}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        {gaps.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <p className="flex-1 text-xs text-pretty text-muted-foreground">
              <span className="font-medium text-foreground">{gaps.map((g) => g.skill).join(" e ")}</span> non sono nel tuo
              profilo, quindi il CV non li cita. Se li hai, aggiungili e rigenera; altrimenti preparati a parlarne al colloquio.
            </p>
            <Button variant="outline" size="xs" onClick={onOpenProfile}>
              Apri profilo
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Cosa è cambiato rispetto al profilo</h3>
        <ul className="space-y-1.5">
          {cv.changes.map((c) => (
            <li key={c} className="flex gap-2 text-sm">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              {c}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Anteprima</h3>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Evidenzia le modifiche
            <Switch size="sm" checked={marks} onCheckedChange={setMarks} />
          </label>
        </div>
        <Paper cv={cv} marks={marks} />
      </section>
    </div>
  )
}

/** The CV page as it will print: always white paper, whatever the app theme. */
function Paper({ cv, marks }: { cv: ReturnType<typeof tailoredFor>; marks: boolean }) {
  const { profile } = useProfile()
  const mark = (on?: boolean) =>
    cn("rounded-[2px] transition-colors", on && marks && "bg-amber-200/70 box-decoration-clone px-0.5")

  return (
    <div className="rounded-lg border bg-muted/40 p-4 sm:p-6">
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto aspect-[1/1.414] max-w-xl overflow-hidden rounded-sm bg-white px-[7%] py-[6%] text-[10px] leading-relaxed text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_24px_-8px_rgba(0,0,0,.18)]"
      >
        <header className="border-b border-neutral-200 pb-3">
          <h1 className="text-[18px] font-semibold tracking-tight text-neutral-950">{profile.name || "Il tuo nome"}</h1>
          <p className="text-[11px] text-neutral-600">Senior Backend Engineer · Python, event-driven systems</p>
          <p className="mt-1 text-[9px] text-neutral-500">
            {profile.location} · {profile.email} · {profile.links.map((l) => l.label).join(" · ")}
          </p>
        </header>

        <CvSection title="Profile">
          <p className={mark(true)}>{cv.summary}</p>
        </CvSection>

        <CvSection title="Experience">
          <div className="space-y-2.5">
            {cv.experiences.map((e) => (
              <div key={e.role}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-neutral-950">
                    {e.role} <span className="font-normal text-neutral-500">· {e.company}</span>
                  </p>
                  <p className="shrink-0 text-[9px] text-neutral-500 tabular-nums">{e.dates}</p>
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {e.bullets.map((b) => (
                    <li key={b.text} className="flex gap-1.5">
                      <span className="text-neutral-400">–</span>
                      <span className={mark(b.changed)}>{b.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CvSection>

        <CvSection title="Skills">
          <p className={mark(true)}>{cv.skills.join(" · ")}</p>
        </CvSection>

        <CvSection title="Education">
          <p>
            <span className="font-semibold text-neutral-950">MSc Computer Engineering</span> · Politecnico di Torino ·
            2019
          </p>
        </CvSection>

        <CvSection title="Languages">
          <p>Italian (native) · English (C1) · German (A2)</p>
        </CvSection>
      </motion.article>
    </div>
  )
}

function CvSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h2 className="mb-1 text-[8.5px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">{title}</h2>
      {children}
    </section>
  )
}

/** Small "CV ✓" marker in the jobs table. */
export function CvMark({ url }: { url: string }) {
  const { generated } = useProfile()
  return (
    <AnimatePresence>
      {generated.has(url) && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="ml-1.5 inline-flex h-4 items-center gap-0.5 rounded border px-1 align-middle text-[10px] font-medium text-muted-foreground"
          title="CV generato per questa offerta"
        >
          <FileUserIcon className="size-2.5" />
          CV
        </motion.span>
      )}
    </AnimatePresence>
  )
}
