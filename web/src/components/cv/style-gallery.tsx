import { useEffect, useState } from "react"
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { CvPage } from "@/components/cv/cv-page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CV_TEMPLATES, type CvTemplate } from "@/lib/api"
import { useCvPreview } from "@/lib/cv-preview"
import { useCvPrefs, useSaveCvPrefs } from "@/lib/cv-prefs"
import { useLocale, useT } from "@/lib/i18n"
import { useProfile } from "@/lib/profile"
import { cn } from "@/lib/utils"

/**
 * Every CV style with the same data, side by side, so the differences are seen rather than
 * described. A style opens large with its description; "Use this style" saves it.
 */
export function StyleGallery({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT().cv
  const prefs = useCvPrefs()
  const save = useSaveCvPrefs()
  const locale = useLocale()
  const { profile } = useProfile()
  const hasOwn = !!(profile.name || profile.experiences.length || profile.education.length)
  const [source, setSource] = useState<"mine" | "sample">(hasOwn ? "mine" : "sample")
  const [focus, setFocus] = useState<CvTemplate | null>(null)
  // Each opening starts from the user's own profile when there is one (the profile may have
  // loaded, or been filled in, since this component mounted).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSource(hasOwn ? "mine" : "sample")
  }

  // Without a posting, "the posting's language" falls back to the UI's.
  const format = prefs.format === "letter" ? ("letter" as const) : ("a4" as const)
  const preview = useCvPreview({
    templates: [...CV_TEMPLATES],
    language: prefs.language === "job" ? locale : prefs.language,
    format,
    photo: prefs.photo !== "never" && !!profile.photo,
    profile: source === "mine" && hasOwn ? profile : null,
  })
  const pages = open ? preview.data?.pages : undefined
  const use = (template: CvTemplate) => save.mutate({ style: template })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setFocus(null)
      }}
    >
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto p-0 sm:max-w-6xl">
        <DialogHeader className="sticky top-0 z-10 flex-row flex-wrap items-end gap-4 border-b bg-background/95 px-6 pt-5 pb-4 backdrop-blur">
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle>{t.gallery.title}</DialogTitle>
            <DialogDescription className="text-pretty">{t.gallery.text}</DialogDescription>
          </div>
          <div className="flex items-center gap-3">
            {!hasOwn && <span className="text-xs text-muted-foreground">{t.gallery.noProfile}</span>}
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={hasOwn ? source : "sample"}
              onValueChange={(v) => v && setSource(v as "mine" | "sample")}
            >
              <ToggleGroupItem value="mine" disabled={!hasOwn} className="px-3 text-xs">
                {t.gallery.mine}
              </ToggleGroupItem>
              <ToggleGroupItem value="sample" className="px-3 text-xs">
                {t.gallery.sample}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {focus ? (
            <motion.div
              key="focus"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              <Focus
                template={focus}
                html={pages?.[focus]}
                format={format}
                inUse={prefs.style === focus}
                onUse={() => use(focus)}
                onMove={setFocus}
                onBack={() => setFocus(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4"
            >
              {CV_TEMPLATES.map((id) => {
                const info = t.templates[id]
                const active = prefs.style === id
                return (
                  <div key={id} className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setFocus(id)}
                      aria-label={t.gallery.enlarge(info.name)}
                      className={cn(
                        "group relative block w-full overflow-hidden rounded-md border shadow-xs outline-none transition-all",
                        "hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50",
                        active && "ring-2 ring-foreground",
                      )}
                    >
                      <CvPage html={pages?.[id]} format={format} />
                      {active && (
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                          <CheckIcon className="size-2.5" />
                          {t.gallery.inUse}
                        </span>
                      )}
                    </button>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{info.name}</p>
                      <p className="text-xs text-pretty text-muted-foreground">{info.design}</p>
                    </div>
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

function Focus({
  template,
  html,
  format,
  inUse,
  onUse,
  onMove,
  onBack,
}: {
  template: CvTemplate
  html: string | undefined
  format: "a4" | "letter"
  inUse: boolean
  onUse: () => void
  onMove: (t: CvTemplate) => void
  onBack: () => void
}) {
  const t = useT().cv
  const info = t.templates[template]
  const i = CV_TEMPLATES.indexOf(template)
  const prev = CV_TEMPLATES[(i - 1 + CV_TEMPLATES.length) % CV_TEMPLATES.length]
  const next = CV_TEMPLATES[(i + 1) % CV_TEMPLATES.length]

  // ← and → walk through the styles, as in a photo viewer, unless a control that uses the
  // arrow keys itself (the Mine/Sample toggle, a menu, a field) has the focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('[role="group"],[role="radiogroup"],[role="listbox"],[role="menu"],input,textarea,select')) return
      if (e.key === "ArrowLeft") onMove(prev)
      if (e.key === "ArrowRight") onMove(next)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prev, next, onMove])

  return (
    <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="rounded-lg bg-muted/50 p-4 sm:p-8">
        <CvPage html={html} format={format} className="mx-auto max-w-2xl rounded-sm shadow-[0_1px_2px_rgba(0,0,0,.06),0_12px_32px_-12px_rgba(0,0,0,.25)]" />
      </div>
      <div className="flex flex-col gap-5 md:sticky md:top-28 md:self-start">
        <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onBack}>
          <ArrowLeftIcon />
          {t.gallery.back}
        </Button>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{info.name}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {i + 1}/{CV_TEMPLATES.length}
            </span>
          </div>
          <p className="text-sm text-pretty">{info.design}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t.gallery.suits}:</span> {info.suits}
          </p>
        </div>
        <Button onClick={onUse} disabled={inUse}>
          <CheckIcon />
          {inUse ? t.gallery.inUse : t.gallery.use}
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label={t.gallery.prev} onClick={() => onMove(prev)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t.gallery.next} onClick={() => onMove(next)}>
            <ChevronRightIcon />
          </Button>
          <span className="ml-1 text-xs text-muted-foreground">
            {t.templates[prev].name} · {t.templates[next].name}
          </span>
        </div>
      </div>
    </div>
  )
}
