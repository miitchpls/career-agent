/**
 * Apple platforms use ⌘ where the others use Ctrl, in both shortcuts and their labels.
 * `userAgentData` is the current API; `navigator.platform` is deprecated but still the only
 * source in Safari and Firefox.
 */
const platform =
  typeof navigator === "undefined"
    ? ""
    : ((navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ||
      navigator.platform)

export const isMac = /mac|iphone|ipad|ios/i.test(platform)

/** Label of the modifier key for shortcuts handled with `metaKey || ctrlKey`. */
export const MOD_KEY = isMac ? "⌘" : "Ctrl"
