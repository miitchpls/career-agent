import type { WorkMode } from "@/lib/api"

export type KnownMode = Exclude<WorkMode, "unknown">

/**
 * A scope's `modes` list encodes two choices: which modes, and whether to keep postings
 * whose mode couldn't be read from the text ("unknown"). Empty list = any mode.
 */
export function splitModes(modes: WorkMode[]): { known: KnownMode[]; includeUnknown: boolean } {
  const known = modes.filter((m): m is KnownMode => m !== "unknown")
  // No modes chosen yet: default to keeping unknown ones (most postings don't say).
  return { known, includeUnknown: known.length === 0 || modes.includes("unknown") }
}

export function joinModes(known: KnownMode[], includeUnknown: boolean): WorkMode[] {
  if (!known.length) return []
  return includeUnknown ? [...known, "unknown"] : known
}
