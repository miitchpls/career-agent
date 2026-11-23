import { ArrowUpRightIcon, CheckIcon, RefreshCwIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { AiProvider } from "@/lib/api"
import { LOCALES, setLocale, useLocale, useT, type Locale } from "@/lib/i18n"
import { useAiEngines, useChooseAi } from "@/lib/use-ai"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"

const THEMES: Theme[] = ["light", "dark", "system"]

/** A tiny window in the theme's colours, so the choice is seen rather than read. */
function ThemePreview({ theme }: { theme: Theme }) {
  const window = (dark: boolean) => (
    <div className={cn("flex size-full flex-col gap-1.5 p-2.5", dark ? "bg-neutral-950" : "bg-white")}>
      <div className="flex items-center gap-1">
        <span className={cn("size-1.5 rounded-full", dark ? "bg-neutral-600" : "bg-neutral-300")} />
        <span className={cn("h-1.5 w-8 rounded-full", dark ? "bg-neutral-700" : "bg-neutral-200")} />
      </div>
      <div className={cn("mt-1 h-4 rounded-[3px] border", dark ? "border-neutral-800 bg-neutral-900" : "border-neutral-200 bg-white")} />
      <div className="space-y-1 pt-0.5">
        {[90, 70, 80].map((w) => (
          <div key={w} className={cn("h-1.5 rounded-full", dark ? "bg-neutral-800" : "bg-neutral-100")} style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
  if (theme !== "system") return window(theme === "dark")
  // Half and half: it follows the device.
  return (
    <div className="relative size-full">
      {window(false)}
      <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">{window(true)}</div>
    </div>
  )
}

export function PreferencesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT().prefs
  const { theme = "system", setTheme } = useTheme()
  const language = useLocale()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No initial focus: a focus ring on the first theme would read as "selected". */}
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="divide-y">
          <section className="space-y-3 px-6 py-5">
            <div>
              <h3 className="text-sm font-medium">{t.appearance}</h3>
              <p className="text-xs text-muted-foreground">{t.appearanceHint}</p>
            </div>
            <div role="radiogroup" aria-label={t.appearance} className="grid grid-cols-3 gap-3">
              {THEMES.map((value) => {
                const active = theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(value)}
                    className="group space-y-2 text-left outline-none"
                  >
                    <div
                      className={cn(
                        "relative aspect-[4/3] overflow-hidden rounded-lg border transition-all",
                        "group-hover:border-foreground/30 group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                        active && "border-foreground ring-1 ring-foreground group-hover:border-foreground",
                      )}
                    >
                      <ThemePreview theme={value} />
                      {active && (
                        <span className="absolute right-1.5 bottom-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background">
                          <CheckIcon className="size-2.5" />
                        </span>
                      )}
                    </div>
                    <p className={cn("text-xs", active ? "font-medium" : "text-muted-foreground")}>{t[value]}</p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="flex items-center justify-between gap-6 px-6 py-5">
            <div>
              <h3 className="text-sm font-medium">{t.language}</h3>
              <p className="text-xs text-muted-foreground">{t.languageHint}</p>
            </div>
            <Select value={language} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger className="w-40 shrink-0" aria-label={t.language}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <AiSection />
        </div>
      </DialogContent>
    </Dialog>
  )
}

const DEFAULT_MODEL = "__default"

/** The AI CLIs on this computer: pick the one that reads CVs, and its model. */
function AiSection() {
  const t = useT().prefs
  const engines = useAiEngines()
  const choose = useChooseAi()
  const pick = (provider: string, model: string | null) =>
    choose.mutate({ provider, model }, { onError: (e) => toast.error(e.message) })
  const active = engines.data?.active
  const none = engines.data && !engines.data.providers.some((p) => p.connected)

  return (
    <section className="space-y-3 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">{t.ai}</h3>
          <p className="text-xs text-muted-foreground text-pretty">{t.aiHint}</p>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 text-muted-foreground"
          disabled={engines.isFetching}
          onClick={() => void engines.refetch()}
        >
          <RefreshCwIcon className={cn(engines.isFetching && "animate-spin")} />
          {t.aiRecheck}
        </Button>
      </div>

      {engines.isPending ? (
        <div className="space-y-px overflow-hidden rounded-lg border">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3.5 py-3">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="ml-auto h-3 w-20" />
            </div>
          ))}
        </div>
      ) : engines.isError ? (
        <p className="text-xs text-destructive">{t.aiLoadFailed}</p>
      ) : (
        <div role="radiogroup" aria-label={t.ai} className="divide-y overflow-hidden rounded-lg border">
          {engines.data.providers.map((p) => (
            <EngineRow
              key={p.id}
              provider={p}
              active={active?.provider === p.id}
              model={active?.provider === p.id ? active.model : null}
              onPick={(model) => pick(p.id, model)}
            />
          ))}
        </div>
      )}
      {none && <p className="text-xs text-muted-foreground">{t.aiNone}</p>}
    </section>
  )
}

function EngineRow({
  provider: p,
  active,
  model,
  onPick,
}: {
  provider: AiProvider
  active: boolean
  model: string | null
  onPick: (model: string | null) => void
}) {
  const t = useT().prefs
  return (
    <div className={cn("transition-colors", active && "bg-muted/50")}>
      <div className={cn("flex items-center gap-3 pr-3.5", p.connected && !active && "hover:bg-muted/40")}>
        <button
          type="button"
          role="radio"
          aria-checked={active}
          disabled={!p.connected}
          onClick={() => !active && onPick(null)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 text-left outline-none focus-visible:underline disabled:cursor-default"
        >
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
              active ? "border-foreground bg-foreground" : "border-muted-foreground/40",
              !p.connected && "border-dashed",
            )}
          >
            {active && <span className="size-1.5 rounded-full bg-background" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className={cn("text-sm font-medium", !p.connected && "text-muted-foreground")}>{p.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{p.command}</span>
            </span>
            {p.installed && !p.connected && (
              <span className="block text-xs text-muted-foreground">{t.aiSignInHint(p.login)}</span>
            )}
          </span>
        </button>
        <EngineStatus provider={p} />
      </div>
      {active && (
        <div className="flex items-center justify-between gap-3 px-3.5 pb-3 pl-10.5">
          <span className="text-xs text-muted-foreground">{t.aiModel}</span>
          <Select value={model ?? DEFAULT_MODEL} onValueChange={(v) => onPick(v === DEFAULT_MODEL ? null : v)}>
            <SelectTrigger size="sm" className="h-7 w-48 text-xs" aria-label={t.aiModel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={DEFAULT_MODEL} className="text-xs">
                {t.aiDefaultModel(p.name)}
              </SelectItem>
              {p.models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

function EngineStatus({ provider: p }: { provider: AiProvider }) {
  const t = useT().prefs
  if (p.connected)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {t.aiConnected(p.plan)}
      </span>
    )
  if (p.installed)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-amber-500" />
        {t.aiSignIn}
      </span>
    )
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      {t.aiMissing}
      <a
        href={p.install_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 text-foreground underline-offset-4 hover:underline"
      >
        {t.aiInstall}
        <ArrowUpRightIcon className="size-3" />
      </a>
    </span>
  )
}
