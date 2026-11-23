/** Whether the preferences dialog is open, so any screen can send the user there. */
import { useSyncExternalStore } from "react"

let open = false
const listeners = new Set<() => void>()

export function setPreferencesOpen(value: boolean) {
  open = value
  listeners.forEach((l) => l())
}

export const openPreferences = () => setPreferencesOpen(true)

export function usePreferencesOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )
}
