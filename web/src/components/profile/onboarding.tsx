import { useEffect, useRef, useState } from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  ClipboardPasteIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PencilLineIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react"
import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/lib/i18n"
import { openPreferences } from "@/lib/preferences"
import { ACCEPT, useImport } from "@/lib/use-import"
import { profileStore, useProfile } from "@/lib/profile"
import { activeEngine, useAiEngines } from "@/lib/use-ai"
import { cn } from "@/lib/utils"

/** Empty profile: one big drop zone for a CV, and two quieter ways in. */
export function Onboarding() {
  const t = useT().onboarding
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [paste, setPaste] = useState(false)
  const engines = useAiEngines()
  const engine = activeEngine(engines.data)
  // Before the check answers, assume an engine: a wrong guess only costs an error toast.
  const canImport = engines.isPending || !!engine
  const upload = useImport()
  const pick = (f: File | undefined) => {
    if (f && canImport && !upload.busy) void upload.file(f)
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-2 text-center"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{t.title}</h1>
        <p className="text-sm text-muted-foreground text-balance">{t.text}</p>
      </motion.div>

      <motion.button
        type="button"
        disabled={!canImport || upload.busy}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.08 } }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (canImport) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          pick(e.dataTransfer.files[0])
        }}
        className={cn(
          "group mt-10 flex w-full flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-12 text-center transition-all outline-none",
          "enabled:hover:border-foreground/30 enabled:hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed",
          !canImport && "opacity-60",
          over && "scale-[1.01] border-foreground/50 bg-muted/60",
        )}
      >
        <div className="relative">
          <div className="absolute inset-0 -z-10 rotate-6 rounded-xl border bg-background transition-transform group-enabled:group-hover:rotate-12" />
          <div className="grid size-12 place-items-center rounded-xl border bg-background shadow-xs transition-transform group-enabled:group-hover:-translate-y-0.5">
            {upload.busy ? (
              <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <UploadIcon className="size-5 text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{upload.busy ? t.uploading : over ? t.drop : t.import}</p>
          <p className="text-sm text-muted-foreground">
            {t.dragBefore}
            <span className="text-foreground underline underline-offset-4">{t.browse}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          {t.kinds.map((k) => (
            <span key={k} className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {k}
            </span>
          ))}
        </div>
      </motion.button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = "" // picking the same file again still fires
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.16 } }}
        className="mt-3 grid gap-3 sm:grid-cols-2"
      >
        <OptionCard
          icon={ClipboardPasteIcon}
          title={t.paste}
          description={t.pasteHint}
          disabled={!canImport}
          onClick={() => setPaste(true)}
        />
        <OptionCard icon={PencilLineIcon} title={t.manual} description={t.manualHint} onClick={profileStore.startBlank} />
      </motion.div>

      <EngineLine />

      <PasteDialog open={paste} onOpenChange={setPaste} />
    </div>
  )
}

/** Which AI reads the CV, and where to change it: the privacy promise, made concrete. */
function EngineLine() {
  const t = useT().onboarding
  const engines = useAiEngines()
  const engine = activeEngine(engines.data)
  if (engines.isPending) return <div className="mt-8 h-4" />
  return (
    <p className="mt-8 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-muted-foreground">
      {engine ? (
        <>
          <ShieldCheckIcon className="size-3.5 shrink-0" />
          {t.engineLine(engine.provider.name, engine.model)}
          <button type="button" onClick={openPreferences} className="text-foreground underline-offset-4 hover:underline">
            {t.changeEngine}
          </button>
        </>
      ) : (
        <>
          <SparklesIcon className="size-3.5 shrink-0" />
          {t.noEngine}
          <button type="button" onClick={openPreferences} className="text-foreground underline-offset-4 hover:underline">
            {t.setupEngine}
          </button>
        </>
      )}
    </p>
  )
}

function OptionCard({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof UploadIcon
  title: string
  description: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none enabled:hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}

function PasteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const all = useT()
  const t = all.onboarding
  const [text, setText] = useState("")
  const upload = useImport()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.pasteTitle}</DialogTitle>
          <DialogDescription>{t.pasteDescription}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.pastePlaceholder}
          className="max-h-[50svh] min-h-64 font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {all.common.cancel}
          </Button>
          <Button
            disabled={text.trim().length < 40 || upload.busy}
            onClick={async () => {
              if (await upload.text(text)) {
                onOpenChange(false)
                setText("")
              }
            }}
          >
            {upload.busy && <LoaderCircleIcon className="animate-spin" />}
            {t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "1:05" since `iso`, ticking every second. */
function useElapsed(iso: string | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!iso) return ""
  // Server timestamps are UTC ISO with an offset; treat a bare one as UTC too.
  const start = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)
  const s = Math.max(0, Math.floor((now - start) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** The import at work, or how it failed. The steps are real: the file is read, the AI runs, its answer is checked. */
export function Importing() {
  const all = useT()
  const t = all.onboarding
  const { draft, stage } = useProfile()
  const engines = useAiEngines()
  const name = engines.data?.providers.find((p) => p.id === draft?.provider)?.name ?? "AI"
  const failed = stage === "failed"
  const elapsed = useElapsed(draft?.created_at)
  const [retrying, setRetrying] = useState(false)
  const steps = [t.stepRead, t.stepExtract(name), t.stepCheck]
  const current = failed ? -1 : 1

  return (
    <div className="mx-auto max-w-md py-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border bg-card p-6 shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg border bg-background",
              failed && "border-destructive/30 bg-destructive/5",
            )}
          >
            {failed ? (
              <AlertCircleIcon className="size-4 text-destructive" />
            ) : (
              <FileTextIcon className="size-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{failed ? t.failedTitle : (draft?.filename ?? t.pastedText)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {failed ? (draft?.filename ?? t.pastedText) : t.working(name)}
            </p>
          </div>
          {!failed && <span className="font-mono text-xs text-muted-foreground tabular-nums">{elapsed}</span>}
        </div>

        {failed ? (
          <div className="mt-5 space-y-2">
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm break-words">
              {draft?.error}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.failedHint}{" "}
              <button type="button" onClick={openPreferences} className="text-foreground underline-offset-4 hover:underline">
                {t.openPrefs}
              </button>
            </p>
          </div>
        ) : (
          <>
            <ol className="mt-6 space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                      i < current && "border-foreground bg-foreground text-background",
                    )}
                  >
                    {i < current ? (
                      <CheckIcon className="size-3" />
                    ) : i === current ? (
                      <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
                    ) : null}
                  </span>
                  <span className={cn(i > current && "text-muted-foreground", i === current && "text-shimmer")}>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs text-muted-foreground">{t.patience}</p>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => void profileStore.cancelImport()}>
            {failed ? all.common.close : t.cancelImport}
          </Button>
          {failed && (
            <Button
              size="sm"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true)
                await profileStore.retryImport()
                setRetrying(false)
              }}
            >
              {retrying && <LoaderCircleIcon className="animate-spin" />}
              {all.common.retry}
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
