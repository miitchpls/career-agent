import { useRef, useState } from "react"
import { CornerDownLeftIcon, LinkIcon, LoaderCircleIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { SiteMark } from "@/components/jobs/work-mode-badge"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { useT } from "@/lib/i18n"
import { recognize, type LinkSite } from "@/lib/job-link"
import { cn } from "@/lib/utils"

/**
 * The home's second way in, below the search: a quiet line that opens into a one-line field for
 * a posting's link. Recognises the board as the link is pasted; Enter opens the posting.
 */
export function OpenLink({ busy, onOpen }: { busy: boolean; onOpen: (url: string, site: LinkSite) => void }) {
  const t = useT().link
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState("")
  const input = useRef<HTMLInputElement>(null)
  const link = value.trim() ? recognize(value) : null
  const wrong = !!value.trim() && !link

  const submit = () => {
    if (!link || busy) return
    onOpen(value.trim(), link.site)
    setValue("")
  }

  return (
    <div className="mt-4 flex flex-col items-center">
      <AnimatePresence initial={false} mode="wait">
        {!expanded ? (
          <motion.button
            key="line"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <LinkIcon className="size-3.5" />
            {t.prompt}
            <span className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground/60">
              {t.action}
            </span>
          </motion.button>
        ) : (
          <motion.div
            key="field"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="w-full max-w-lg space-y-1.5"
          >
            <InputGroup className={cn("h-9 bg-background", wrong && "border-destructive/50")}>
              <InputGroupAddon>
                {link ? <SiteMark site={link.site} /> : <LinkIcon className="text-muted-foreground" />}
              </InputGroupAddon>
              <InputGroupInput
                ref={input}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // The sheet focuses its close button as it opens: without this, the same
                    // Enter would press it.
                    e.preventDefault()
                    submit()
                  }
                  if (e.key === "Escape" && !value) setExpanded(false)
                }}
                onBlur={() => !value && !busy && setExpanded(false)}
                placeholder={t.placeholder}
                aria-label={t.label}
                aria-invalid={wrong || undefined}
                inputMode="url"
                spellCheck={false}
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton variant="default" disabled={!link || busy} onClick={submit}>
                  {busy ? <LoaderCircleIcon className="animate-spin" /> : <CornerDownLeftIcon />}
                  {busy ? t.reading : t.open}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className={cn("px-1 text-xs", wrong ? "text-destructive" : "text-muted-foreground")}>
              {wrong ? t.unsupported : link ? t.hintSite(link.site === "linkedin" ? "LinkedIn" : "Indeed") : t.hint}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
