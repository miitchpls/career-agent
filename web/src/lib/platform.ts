/** Apple platforms use ⌘ where the others use Ctrl, in both shortcuts and their labels. */
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** Label of the modifier key for shortcuts handled with `metaKey || ctrlKey`. */
export const MOD_KEY = isMac ? "⌘" : "Ctrl"
