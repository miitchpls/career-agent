import { UserRoundPlusIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { hasProfile, useProfile } from "@/lib/profile-mock"
import { cn } from "@/lib/utils"

/** Header entry to the profile: quiet, the search stays the main thing. */
export function ProfileButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const state = useProfile()
  const ready = hasProfile(state) && !!state.profile.name
  const initials = state.profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")

  return (
    <Button variant="ghost" size="sm" onClick={onClick} className={cn("gap-1.5", active && "bg-muted")}>
      {ready ? (
        <span className="relative">
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px] font-medium">{initials}</AvatarFallback>
          </Avatar>
          {state.stage === "review" && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-background bg-amber-500" />
          )}
        </span>
      ) : (
        <UserRoundPlusIcon />
      )}
      {ready ? "Profilo" : "Crea profilo"}
    </Button>
  )
}
