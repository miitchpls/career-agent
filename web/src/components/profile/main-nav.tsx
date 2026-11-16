import { motion } from "motion/react"

import { useProfile } from "@/lib/profile-mock"
import { cn } from "@/lib/utils"

export type View = "offerte" | "profilo"

/** Top-level sections, beside the logo. The active pill slides between tabs. */
export function MainNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const { stage } = useProfile()
  const tabs: { id: View; label: string; dot?: boolean }[] = [
    { id: "offerte", label: "Offerte" },
    { id: "profilo", label: "Profilo", dot: stage === "review" },
  ]
  return (
    <nav aria-label="Sezioni" className="flex items-center gap-0.5">
      {tabs.map((t) => {
        const active = view === t.id
        return (
          <button
            key={t.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="main-nav-pill"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="absolute inset-0 -z-10 rounded-md bg-muted"
              />
            )}
            {t.label}
            {t.dot && <span className="size-1.5 rounded-full bg-amber-500" aria-label="campi da verificare" />}
          </button>
        )
      })}
    </nav>
  )
}
