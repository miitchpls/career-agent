/** Starting a profile import from a file or pasted text, shared by the onboarding and the profile page. */
import { useState } from "react"
import { toast } from "sonner"

import { profileStore } from "@/lib/profile"

export const ACCEPT = ".pdf,.md,.markdown,.txt"

/** Sends a CV to the import; returns whether it started (errors are shown as toasts). */
export function useImport() {
  const [busy, setBusy] = useState(false)
  const run = async (start: () => Promise<void>) => {
    setBusy(true)
    try {
      await start()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return {
    busy,
    file: (f: File) => run(() => profileStore.importFile(f)),
    text: (text: string) => run(() => profileStore.importText(text)),
  }
}
