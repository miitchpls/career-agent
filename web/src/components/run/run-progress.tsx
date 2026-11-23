import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  CirclePauseIcon,
  HistoryIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { api, type RunStatus, type RunStep } from "@/lib/api"
import { ago } from "@/lib/format"
import { useT } from "@/lib/i18n"
import { ANYWHERE, runMessage, stepOutcome } from "@/lib/run-messages"
import { useRunStatus } from "@/lib/queries"
import { useRunEffects } from "@/lib/use-run-effects"
import { cn } from "@/lib/utils"

const SITE: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed" }

function StepRow({ step }: { step: RunStep }) {
  const all = useT()
  const t = all.run
  const icon = {
    pending: <CircleIcon className="size-3 text-muted-foreground/50" />,
    running: <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />,
    done: <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
    error: <AlertCircleIcon className="size-3.5 text-destructive" />,
    recent: <HistoryIcon className="size-3.5 text-muted-foreground/70" />,
    skipped: <CirclePauseIcon className="size-3.5 text-amber-600 dark:text-amber-400" />,
  }[step.status]
  const outcome = {
    pending: t.stepPending,
    running: t.stepRunning,
    done: stepOutcome(step),
    error: step.error ?? t.stepError,
    recent: t.stepRecent(step.ran_at ? ago(step.ran_at) : null),
    skipped: t.stepHeld(step.error),
  }[step.status]
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-xs">
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className="w-16 shrink-0 text-muted-foreground">{SITE[step.site] ?? step.site}</span>
      <span className="min-w-0 flex-1 truncate">
        «{step.keyword}» · {step.place === ANYWHERE ? all.common.anywhere : step.place}
      </span>
      <span
        title={outcome}
        className={cn("max-w-[60%] truncate text-muted-foreground", step.status === "error" && "text-destructive")}
      >
        {outcome}
      </span>
    </li>
  )
}

function Panel({ status, onDismiss }: { status: RunStatus; onDismiss: () => void }) {
  const all = useT()
  const t = all.run
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const cancel = useMutation({
    mutationFn: api.cancel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["status"] }),
  })
  const msg = runMessage(status)
  if (!msg) return null
  const pct = status.total_steps ? (100 * status.done_steps) / status.total_steps : 0
  const failed = !msg.live && status.steps.length > 0 && status.steps.every((s) => s.status === "error")

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="grid size-4 shrink-0 place-items-center">
          {msg.live ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          ) : failed ? (
            <AlertCircleIcon className="size-4 text-destructive" />
          ) : (
            <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
          )}
        </span>
        <div className="relative min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={msg.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cn("truncate text-sm", msg.live ? "text-shimmer" : "text-foreground")}
            >
              {msg.text}
            </motion.p>
          </AnimatePresence>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {status.done_steps}/{status.total_steps}
        </span>
        {/* With a single search the details would just repeat the message. */}
        {status.steps.length > 1 && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={open ? t.hideDetails : t.showDetails}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground"
          >
            <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        )}
        {status.running ? (
          <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {t.stop}
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label={all.common.close} onClick={onDismiss} className="text-muted-foreground">
            <XIcon />
          </Button>
        )}
      </div>
      {status.running && (
        <div className="h-0.5 bg-muted">
          <motion.div
            className="h-full bg-foreground/40"
            initial={false}
            animate={{ width: `${Math.max(pct, 4)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t px-4 py-1"
          >
            {status.steps.map((s, i) => (
              <StepRow key={i} step={s} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Portal-search progress, inline on the results page: a human sentence (not raw logs)
 * with a shimmer while it works, expandable per-search details, and the summary at the end.
 */
export function RunProgress() {
  const { data: status } = useRunStatus()
  useRunEffects(status)
  // Dismissing hides this run's summary; the next run (new `started`) shows again.
  const [dismissed, setDismissed] = useState<string | null>(null)
  const visible = !!status?.started && status.phase !== "idle" && (status.running || dismissed !== status.started)

  return (
    <AnimatePresence initial={false}>
      {visible && status && (
        <motion.div
          key="run"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <Panel status={status} onDismiss={() => setDismissed(status.started)} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
