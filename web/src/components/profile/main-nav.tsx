import { motion } from "motion/react"

import { useT } from "@/lib/i18n"
import { useProfile } from "@/lib/profile"
import { cn } from "@/lib/utils"

export type View = "offerte" | "candidature" | "profilo"

/** Top-level sections, beside the logo. The active pill slides between tabs. */
export function MainNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useT().app
  const { stage } = useProfile()
  const tabs: { id: View; label: string; dot?: boolean }[] = [
    { id: "offerte", label: t.jobs },
    { id: "candidature", label: t.applications },
    { id: "profilo", label: t.profile, dot: stage === "review" },
  ]
  return (
    <nav aria-label={t.sections} className="flex items-center gap-0.5">
      {tabs.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(tab.id)}
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
            {tab.label}
            {tab.dot && <span className="size-1.5 rounded-full bg-amber-500" aria-label={t.toReview} />}
          </button>
        )
      })}
    </nav>
  )
}
