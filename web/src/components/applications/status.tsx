import { CheckIcon, ChevronDownIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { STATUSES, statusOf, useFetchCvToSend, useSetStatus, type Application, type AppStatus } from "@/lib/applications"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Colour is for state only: grey while waiting, amber in progress, green offer, red rejected. */
const STATUS_DOT: Record<AppStatus, string> = {
  saved: "border border-muted-foreground/70",
  applied: "bg-muted-foreground",
  screening: "bg-amber-500",
  interview: "bg-amber-500",
  offer: "bg-emerald-500",
  rejected: "bg-red-500",
  ghosted: "bg-muted-foreground/40",
  withdrawn: "bg-muted-foreground/40",
}

export function StatusDot({ status, className }: { status: AppStatus; className?: string }) {
  return <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status], className)} aria-hidden />
}

/** The current status as a pill that opens the list of statuses; picking one dates it today. */
export function StatusMenu({ app, align = "start" }: { app: Application; align?: "start" | "end" }) {
  const t = useT().applications
  const current = statusOf(app)
  const set = useSetStatus()
  // Followed, now sent: with the CV generated for it meanwhile, if any.
  const cvToSend = useFetchCvToSend()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-background px-2 text-xs whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-muted"
          aria-label={`${t.changeStatus}: ${t.statuses[current]}`}
        >
          <StatusDot status={current} />
          {t.statuses[current]}
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t.changeStatus}</DropdownMenuLabel>
        {STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={async () => {
              const sending = current === "saved" && s !== "saved" && !app.cv
              set.mutate({ id: app.id, status: s, cv: sending ? await cvToSend(app.url) : null })
            }}
          >
            <StatusDot status={s} />
            {t.statuses[s]}
            {s === current && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
