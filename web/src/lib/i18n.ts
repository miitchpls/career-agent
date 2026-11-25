import { useSyncExternalStore } from "react"

import { de } from "@/locales/de"
import { en } from "@/locales/en"
import { es } from "@/locales/es"
import { fr } from "@/locales/fr"
import { id } from "@/locales/id"
import { it, type Messages } from "@/locales/it"
import { ja } from "@/locales/ja"
import { ko } from "@/locales/ko"
import { nl } from "@/locales/nl"
import { pt } from "@/locales/pt"
import { ru } from "@/locales/ru"
import { tr } from "@/locales/tr"
import { zh } from "@/locales/zh"

export type Locale = "it" | "en" | "de" | "es" | "fr" | "pt" | "nl" | "tr" | "ru" | "id" | "zh" | "ja" | "ko"

/** Each language named in itself, so it can be found whatever the current one is. */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "pt", label: "Português" },
  { value: "nl", label: "Nederlands" },
  { value: "tr", label: "Türkçe" },
  { value: "ru", label: "Русский" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
]

const DICTS: Record<Locale, Messages> = { it, en, de, es, fr, pt, nl, tr, ru, id, zh, ja, ko }
/** BCP 47 tags for Intl (dates, numbers, relative times). */
const TAGS: Record<Locale, string> = {
  it: "it-IT",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-BR",
  nl: "nl-NL",
  tr: "tr-TR",
  ru: "ru-RU",
  id: "id-ID",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
}
const KEY = "locale"

const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.value === v)

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
/** "it-IT", "en-GB", "zh-CN"…: for Intl and toLocaleString. */
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

const languageNames = new Map<string, Intl.DisplayNames>()

/**
 * A language's name in the UI's language, capitalised as a menu item: "Italiano", "Japanese",
 * "Chinesisch (vereinfacht)". From the browser's data, so every language has one.
 */
export function languageName(code: string): string {
  const tag = intlTag()
  let names = languageNames.get(tag)
  if (!names) {
    names = new Intl.DisplayNames([tag], { type: "language", fallback: "code" })
    languageNames.set(tag, names)
  }
  const name = names.of(code === "zh" ? "zh-Hans" : code) ?? code
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1)
}

export type { Messages }
