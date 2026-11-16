import { useState } from "react"

/**
 * A form's working copy: reset from `source` each time the dialog opens
 * (state adjusted during render, React's pattern for "reset state when a prop changes").
 */
export function useDraft<T>(open: boolean, source: T) {
  const [draft, setDraft] = useState(source)
  const [shown, setShown] = useState<T | null>(null)
  if (open && shown !== source) {
    setShown(source)
    setDraft(source)
  }
  if (!open && shown !== null) setShown(null)
  return [draft, setDraft] as const
}
