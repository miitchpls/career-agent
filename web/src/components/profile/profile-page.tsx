import { useRef } from "react"
import { ArrowLeftIcon, DownloadIcon, MoreHorizontalIcon, RotateCcwIcon, UploadIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

import { Importing, Onboarding } from "@/components/profile/onboarding"
import { ProfileView } from "@/components/profile/profile-view"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { hasProfile, profileStore, useProfile } from "@/lib/profile-mock"

/** The profile lives on its own page: the search stays the home, this is a side room. */
export function ProfilePage({ onBack }: { onBack: () => void }) {
  const state = useProfile()
  const file = useRef<HTMLInputElement>(null)

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="flex h-14 items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeftIcon />
          Offerte
        </Button>
        {hasProfile(state) && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
              <UploadIcon />
              Importa CV
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Altre azioni sul profilo">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => toast("Esportazione non ancora disponibile", { description: "È un'anteprima dell'interfaccia." })}>
                  <DownloadIcon />
                  Esporta in Markdown
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={profileStore.reset}>
                  <RotateCcwIcon />
                  Ricomincia da capo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={file}
              type="file"
              accept=".pdf,.md,.markdown,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) profileStore.startImport(f.name)
              }}
            />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={state.stage === "review" ? "ready" : state.stage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
        >
          {state.stage === "empty" && <Onboarding />}
          {state.stage === "importing" && <Importing />}
          {hasProfile(state) && <ProfileView />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
