import { useEffect, useRef, useState } from "react"
import { CheckIcon, ClipboardPasteIcon, FileTextIcon, LoaderCircleIcon, PencilLineIcon, ShieldCheckIcon, UploadIcon } from "lucide-react"
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
import { profileStore, useProfile } from "@/lib/profile-mock"
import { cn } from "@/lib/utils"

const ACCEPT = ".pdf,.md,.markdown,.txt"

/** Empty profile: one big drop zone for a CV, and two quieter ways in. */
export function Onboarding() {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [paste, setPaste] = useState(false)

  return (
    <div className="mx-auto max-w-2xl py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-2 text-center"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Crea il tuo profilo</h1>
        <p className="text-sm text-muted-foreground text-balance">
          Lo usiamo solo per scrivere un CV su misura per ogni offerta. La ricerca funziona anche senza.
        </p>
      </motion.div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.08 } }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) profileStore.startImport(f.name)
        }}
        className={cn(
          "group mt-10 flex w-full flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-12 text-center transition-all outline-none",
          "hover:border-foreground/30 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50",
          over && "scale-[1.01] border-foreground/50 bg-muted/60",
        )}
      >
        <div className="relative">
          <div className="absolute inset-0 -z-10 rotate-6 rounded-xl border bg-background transition-transform group-hover:rotate-12" />
          <div className="grid size-12 place-items-center rounded-xl border bg-background shadow-xs transition-transform group-hover:-translate-y-0.5">
            <UploadIcon className="size-5 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{over ? "Rilascia per importare" : "Importa il tuo CV"}</p>
          <p className="text-sm text-muted-foreground">
            Trascina qui un PDF o un file Markdown, oppure <span className="text-foreground underline underline-offset-4">sfoglia</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          {["PDF", "Markdown", "Testo"].map((t) => (
            <span key={t} className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {t}
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
          const f = e.target.files?.[0]
          if (f) profileStore.startImport(f.name)
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.16 } }}
        className="mt-3 grid gap-3 sm:grid-cols-2"
      >
        <OptionCard
          icon={ClipboardPasteIcon}
          title="Incolla il testo"
          description="Dal tuo profilo LinkedIn, un documento o un vecchio CV."
          onClick={() => setPaste(true)}
        />
        <OptionCard
          icon={PencilLineIcon}
          title="Compila a mano"
          description="Parti da zero, una sezione alla volta."
          onClick={profileStore.startBlank}
        />
      </motion.div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheckIcon className="size-3.5" />
        Il file resta sul tuo computer: al modello arriva solo il testo, una volta.
      </p>

      <PasteDialog open={paste} onOpenChange={setPaste} />
    </div>
  )
}

function OptionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof UploadIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
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
  const [text, setText] = useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Incolla il tuo CV</DialogTitle>
          <DialogDescription>
            Va bene qualsiasi formato: lo dividiamo noi in esperienze, formazione e competenze.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"# Alex Moretti\nBackend Engineer\n\n## Esperienze\n…"}
          className="min-h-64 font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={text.trim().length < 20}
            onClick={() => {
              onOpenChange(false)
              profileStore.startImport("testo incollato")
            }}
          >
            Crea il profilo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STEPS = ["Leggo il documento", "Riconosco le sezioni", "Preparo il profilo da rivedere"]

/** Mock import: walks through the steps, then opens the prefilled profile. */
export function Importing() {
  const { source } = useProfile()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= STEPS.length) {
      const t = setTimeout(profileStore.finishImport, 400)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), 900)
    return () => clearTimeout(t)
  }, [step])

  return (
    <div className="mx-auto max-w-md py-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border bg-card p-6 shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg border bg-background">
            <FileTextIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{source}</p>
            <p className="text-xs text-muted-foreground">Sto creando il profilo, ci vuole qualche secondo</p>
          </div>
        </div>
        <ol className="mt-6 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border transition-colors",
                  i < step && "border-foreground bg-foreground text-background",
                )}
              >
                {i < step ? (
                  <CheckIcon className="size-3" />
                ) : i === step ? (
                  <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />
                ) : null}
              </span>
              <span className={cn(i > step && "text-muted-foreground")}>{s}</span>
            </li>
          ))}
        </ol>
      </motion.div>
    </div>
  )
}
