import { useState } from "react"
import { AlertTriangleIcon, CheckIcon, GaugeIcon, LoaderCircleIcon, MinusIcon, RefreshCwIcon, XIcon } from "lucide-react"

import { ScorePrefsDialog } from "@/components/profile/score-prefs"
import { LinkButton } from "@/components/link-button"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Job, JobScore, ScoreResult } from "@/lib/api"
import { intlTag, useT } from "@/lib/i18n"
import {
  BAND_FLOORS,
  DECISION_DOT,
  formatScore,
  shownScore,
  useCancelScore,
  useScorePrefs,
  useScore,
  useStartScore,
} from "@/lib/job-score"
import { hasProfile, useProfile } from "@/lib/profile"
import { openPreferences } from "@/lib/preferences"
import { activeEngine, useAiEngines } from "@/lib/use-ai"
import { cn } from "@/lib/utils"

/** The posting sheet's "Fit" tab: score it, watch it run, read the result. */
export function ScorePanel({ job, onOpenProfile }: { job: Job; onOpenProfile: () => void }) {
  const all = useT()
  const t = all.score
  const state = useScore(job.url)
  const start = useStartScore(job.url)
  const cancel = useCancelScore(job.url)
  const engine = activeEngine(useAiEngines().data)
  const profile = useProfile()
  const { prefs } = useScorePrefs()
  const [editPrefs, setEditPrefs] = useState(false)

  const latest = state.data?.score ?? null
  const shown = shownScore(state.data)
  const running = latest?.status === "running"
  const blocked = !hasProfile(profile)
    ? { text: t.noProfile, action: <LinkButton onClick={onOpenProfile}>{t.openProfile}</LinkButton> }
    : !engine
      ? { text: t.noEngine, action: <LinkButton onClick={openPreferences}>{all.onboarding.openPrefs}</LinkButton> }
      : !job.description?.trim()
        ? { text: t.noText, action: null }
        : null

  const startButton = (again: boolean) => (
    <Button
      size="sm"
      variant={again ? "ghost" : "default"}
      disabled={!!blocked || start.isPending || running}
      onClick={() => start.mutate()}
    >
      {start.isPending ? <LoaderCircleIcon className="animate-spin" /> : again ? <RefreshCwIcon /> : <GaugeIcon />}
      {again ? t.again : t.start}
    </Button>
  )
  const blockedNote = blocked && (
    <p className="text-xs text-muted-foreground">
      {blocked.text} {blocked.action}
    </p>
  )
  const n = prefs.dealbreakers.length
  const prefsNote = (
    <p className="max-w-md text-xs text-pretty text-muted-foreground">
      {n ? t.prefsSome(n) : t.prefsNone}{" "}
      <LinkButton onClick={() => setEditPrefs(true)}>{n ? t.editPrefs : t.addPrefs}</LinkButton>
    </p>
  )

  if (state.isPending)
    return (
      <div className="space-y-3 px-6 py-8">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )

  return (
    <div>
      {running && (
        <div className="space-y-1 border-b px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-shimmer text-sm font-medium">{t.running}</span>
            <Button variant="ghost" size="xs" className="-mr-2" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {t.cancel}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.runningHint}</p>
          {!shown && (
            <div className="space-y-2 pt-5">
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          )}
        </div>
      )}

      {latest?.status === "failed" && (
        <div className="px-6 pt-6">
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium">{t.failed}</p>
            {latest.error && <p className="text-xs text-pretty text-muted-foreground">{latest.error}</p>}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={!!blocked || start.isPending} onClick={() => start.mutate()}>
                <RefreshCwIcon />
                {all.common.retry}
              </Button>
            </div>
            {blockedNote}
          </div>
        </div>
      )}

      {!shown && !running && latest?.status !== "failed" && (
        <div className="space-y-4 px-6 py-8">
          <div className="space-y-1.5">
            <h3 className="text-[15px] font-semibold">{t.title}</h3>
            <p className="max-w-md text-sm text-pretty text-muted-foreground">{t.intro}</p>
          </div>
          {startButton(false)}
          {blockedNote}
          {prefsNote}
        </div>
      )}

      {shown?.result && (
        <Result
          score={shown}
          result={shown.result}
          action={!running && latest?.status !== "failed" ? startButton(true) : null}
        />
      )}
      <ScorePrefsDialog open={editPrefs} onOpenChange={setEditPrefs} />
    </div>
  )
}

function Result({
  score,
  result: r,
  action,
}: {
  score: JobScore
  result: ScoreResult
  action: React.ReactNode
}) {
  const t = useT().score
  const when = new Date(score.created_at).toLocaleString(intlTag(), { dateStyle: "medium", timeStyle: "short" })
  const filled = { high: 3, medium: 2, low: 1 }[r.confidence]

  return (
    <div>
      {score.stale && (
        <p className="border-b bg-muted/50 px-6 py-2.5 text-xs text-muted-foreground">{t.stale}</p>
      )}
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start gap-5">
          <p className="shrink-0 text-5xl leading-none font-semibold tracking-tighter tabular-nums">
            {formatScore(r.score)}
            <span className="ml-1 text-lg font-medium tracking-normal text-muted-foreground">{t.outOf}</span>
          </p>
          <div className="min-w-0 space-y-1.5 pt-0.5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className={cn("size-2 rounded-full", DECISION_DOT[r.decision])} />
              {t.decisions[r.decision]}
            </p>
            <p className="text-sm text-pretty text-foreground/80">{r.verdict}</p>
          </div>
        </div>
        <Scale value={r.score} />
        {r.hardStop && <p className="mt-3 text-xs text-pretty text-muted-foreground">{t.hardStop}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex gap-[3px]" aria-hidden>
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={cn("h-2.5 w-1 rounded-[1px]", i <= filled ? "bg-foreground" : "bg-muted")} />
                  ))}
                </span>
                {t.confidence[r.confidence]}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{t.confidenceHint}</TooltipContent>
          </Tooltip>
          <span className="size-[3px] rounded-full bg-border" aria-hidden />
          <span>{t.scoredAt(when)}</span>
          {action && <span className="-my-1 ml-auto">{action}</span>}
        </div>
      </div>

      <Section title={t.dimensionsTitle} hint={t.dimensionsHint}>
        <div className="space-y-3">
          {(["cv", "salary", "company"] as const).map((d) => (
            <Dimension key={d} label={t.dimensions[d]} {...r.dimensions[d]} />
          ))}
        </div>
        {r.redFlags.length > 0 && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangleIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
              {t.flagsTitle}
            </p>
            <ul className="space-y-1 pl-5.5">
              {r.redFlags.map((f, i) => (
                <li key={i} className="text-pretty">
                  {f.text}
                  {f.jdQuote && <Quote text={f.jdQuote} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {r.requirements.length > 0 && (
        <Section title={t.requirementsTitle} hint={t.requirementsHint(r.requirements.length + r.omitted)}>
          <Requirements rows={r.requirements} omitted={r.omitted} />
        </Section>
      )}

      {r.gaps.length > 0 && (
        <Section title={t.gapsTitle}>
          <div className="space-y-2.5">
            {r.gaps.map((g) => (
              <div key={g.requirement} className="space-y-2 rounded-lg border px-3.5 py-3 text-sm">
                <p className="font-medium">{g.requirement}</p>
                <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-pretty">
                  {g.risk && (
                    <>
                      <dt className="text-xs text-muted-foreground">{t.risk}</dt>
                      <dd>{g.risk}</dd>
                    </>
                  )}
                  <dt className="text-xs text-muted-foreground">{t.how}</dt>
                  <dd>{g.mitigation}</dd>
                </dl>
              </div>
            ))}
          </div>
        </Section>
      )}

      {r.checks.length > 0 && (
        <Section title={t.checksTitle}>
          <ul className="list-disc space-y-1.5 pl-4.5 text-sm text-pretty marker:text-muted-foreground">
            {r.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t px-6 py-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h4 className="text-[13px] font-semibold">{title}</h4>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** The 1-5 axis with the decision bands and where the score falls. */
function Scale({ value }: { value: number }) {
  const t = useT().score
  const stops = [1, ...BAND_FLOORS, 5]
  const widths = stops.slice(1).map((s, i) => s - stops[i])
  const grid = { gridTemplateColumns: widths.map((w) => `${w}fr`).join(" ") }
  return (
    <div className="mt-5" aria-hidden>
      <div className="relative grid h-1.5 gap-[3px]" style={grid}>
        {widths.map((_, i) => (
          <span key={i} className="rounded-full bg-muted" />
        ))}
        <span
          className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${((value - 1) / 4) * 100}%` }}
        />
      </div>
      <div className="mt-1.5 grid gap-[3px] text-[11px] text-muted-foreground" style={grid}>
        {t.bands.map((b, i) => (
          <span key={b} className={cn("truncate", i === t.bands.length - 1 && "text-right")}>
            {b}
          </span>
        ))}
      </div>
    </div>
  )
}

function Dimension({ label, score, note }: { label: string; score: number | null; note: string }) {
  return (
    <div className="grid grid-cols-[9.5rem_5rem_1.25rem_1fr] items-center gap-3 text-sm max-sm:grid-cols-[8rem_4rem_1rem_1fr]">
      <span className="truncate">{label}</span>
      <span className="grid grid-cols-5 gap-[3px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-[2px]",
              score === null
                ? "bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_3px,transparent_3px_6px)] ring-1 ring-muted ring-inset"
                : i <= score
                  ? "bg-foreground"
                  : "bg-muted",
            )}
          />
        ))}
      </span>
      <span className={cn("tabular-nums", score === null ? "text-muted-foreground" : "font-medium")}>{score ?? "—"}</span>
      <span className="min-w-0 text-xs text-pretty text-muted-foreground">{note}</span>
    </div>
  )
}

function Quote({ text }: { text: string }) {
  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      «<span className="rounded bg-muted px-1 text-foreground/75">{text}</span>»
    </span>
  )
}

const FIRST = 6

function Requirements({ rows, omitted }: { rows: ScoreResult["requirements"]; omitted: number }) {
  const t = useT().score
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, FIRST)
  const match = {
    strong: { icon: CheckIcon, dot: "bg-emerald-500" },
    partial: { icon: MinusIcon, dot: "bg-amber-500" },
    missing: { icon: XIcon, dot: "bg-red-500" },
    na: { icon: MinusIcon, dot: "bg-muted-foreground/40" },
  }
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pr-3 pb-2 font-normal">{t.requirement}</th>
            <th className="pr-3 pb-2 font-normal">{t.importance}</th>
            <th className="pb-2 font-normal">{t.inProfile}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const m = match[r.match]
            return (
              <tr key={r.requirement} className="border-t align-top">
                <td className="py-2.5 pr-3">
                  <span className="text-pretty">{r.requirement}</span>
                  {r.jdQuote && <Quote text={r.jdQuote} />}
                  {r.profileEvidence && r.match !== "na" && (
                    <span className="mt-1 block text-xs text-pretty text-foreground/70">{r.profileEvidence}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                  {t.importanceLabels[r.importance]}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default text-muted-foreground"> · {t.evidenceLabels[r.evidence]}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-60">{t.evidenceHints[r.evidence]}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="py-2.5 text-xs whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("grid size-3.5 place-items-center rounded-full text-white", m.dot)}>
                      <m.icon className="size-2.5" strokeWidth={3} />
                    </span>
                    {t.matchLabels[r.match]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > FIRST && (
        <Button variant="ghost" size="xs" className="-ml-2 mt-1" onClick={() => setAll(!all)}>
          {all ? t.showLess : t.showMore(rows.length - FIRST)}
        </Button>
      )}
      {omitted > 0 && (all || rows.length <= FIRST) && (
        <p className="mt-2 text-xs text-muted-foreground">{t.omitted(omitted)}</p>
      )}
    </div>
  )
}
