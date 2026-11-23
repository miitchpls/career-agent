import { useSyncExternalStore } from "react"

import { de } from "@/locales/de"
import { en } from "@/locales/en"
import { it, type Messages } from "@/locales/it"

export type Locale = "it" | "en" | "de"

/** Each language named in itself, so it can be found whatever the current one is. */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
]

const DICTS: Record<Locale, Messages> = { it, en, de }
/** BCP 47 tags for Intl (dates, numbers, relative times). */
const TAGS: Record<Locale, string> = { it: "it-IT", en: "en-GB", de: "de-DE" }
const KEY = "locale"

const isLocale = (v: unknown): v is Locale => v === "it" || v === "en" || v === "de"

/** Saved choice, else the browser's language when we have it, else Italian. */
function initial(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (isLocale(saved)) return saved
  } catch {
    // no storage (tests, private mode)
  }
  const browser = typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : undefined
  return isLocale(browser) ? browser : "it"
}

let current: Locale = initial()
const listeners = new Set<() => void>()

function apply(l: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = l
}
apply(current)

export function setLocale(l: Locale) {
  if (l === current) return
  current = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    // not persisted, still applied
  }
  apply(l)
  listeners.forEach((f) => f())
}

export const getLocale = () => current
/** "it-IT", "en-GB", "de-DE": for Intl and toLocaleString. */
export const intlTag = () => TAGS[current]
/** Current messages, for plain functions; components use `useT` so they re-render on a change. */
export const msgs = (): Messages => DICTS[current]

function subscribe(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

export function useT(): Messages {
  return DICTS[useLocale()]
}

export type { Messages }
