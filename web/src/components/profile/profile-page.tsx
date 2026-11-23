import { useRef, useState } from "react"
import { DownloadIcon, LoaderCircleIcon, MoreHorizontalIcon, RotateCcwIcon, UploadIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Importing, Onboarding } from "@/components/profile/onboarding"
import { ProfileView } from "@/components/profile/profile-view"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { intlTag, useT } from "@/lib/i18n"
import { hasProfile, profileStore, useProfile } from "@/lib/profile"
import { downloadMarkdown } from "@/lib/profile-md"
import { ACCEPT, useImport } from "@/lib/use-import"

const savedTime = (iso: string) =>
  new Intl.DateTimeFormat(intlTag(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

/** The profile lives on its own page: the search stays the home, this is a side room. */
export function ProfilePage() {
  const all = useT()
  const t = all.onboarding
  const state = useProfile()
  const file = useRef<HTMLInputElement>(null)
  const upload = useImport()
  const [confirmReset, setConfirmReset] = useState(false)
  const view = state.stage === "failed" ? "importing" : state.stage === "review" ? "ready" : state.stage

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16">
      {hasProfile(state) && (
        <div className="flex flex-wrap items-center gap-3 pt-10 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{t.pageTitle}</h1>
          <div className="ml-auto flex items-center gap-1.5">
            {state.savedAt && state.stage === "ready" && (
              <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">{t.savedAt(savedTime(state.savedAt))}</span>
            )}
            {state.stage === "review" ? (
              // A new import would replace the draft under review: finish that one first.
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" size="sm" disabled>
                      <UploadIcon />
                      {t.importCv}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t.importBlocked}</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="outline" size="sm" disabled={upload.busy} onClick={() => file.current?.click()}>
                {upload.busy ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
                {t.importCv}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t.more}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => downloadMarkdown(state.profile)}>
                  <DownloadIcon />
                  {t.exportMd}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmReset(true)}>
                  <RotateCcwIcon />
                  {t.startOver}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={file}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload.file(f)
                e.target.value = ""
              }}
            />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
        >
          {view === "empty" && <Onboarding />}
          {view === "importing" && <Importing />}
          {view === "ready" && <ProfileView />}
        </motion.div>
      </AnimatePresence>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.startOverTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.startOverText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{all.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void profileStore.reset()}>
              {t.startOverConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
