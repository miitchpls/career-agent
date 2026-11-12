import type { WorkMode } from "@/lib/api"
import { MODE_LABEL } from "@/lib/filters"
import { cn } from "@/lib/utils"

const DOT: Record<WorkMode, string> = {
  onsite: "bg-amber-500",
  hybrid: "bg-violet-500",
  remote: "bg-emerald-500",
  unknown: "bg-muted-foreground/40",
}

export function WorkModeBadge({ mode, className }: { mode: WorkMode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-xs whitespace-nowrap",
        mode === "unknown" && "text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[mode])} />
      {mode === "unknown" ? "N/D" : MODE_LABEL[mode]}
    </span>
  )
}

export function SiteMark({ site }: { site: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "grid size-4 place-items-center rounded-[4px] font-mono text-[9px] font-semibold text-white",
          site === "linkedin" ? "bg-[#0a66c2]" : "bg-[#2557a7]",
        )}
      >
        {site === "linkedin" ? "in" : "i"}
      </span>
      {site === "linkedin" ? "LinkedIn" : "Indeed"}
    </span>
  )
}
