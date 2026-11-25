/**
 * The app's addresses. Each page has its own path, and an open posting or application adds its
 * id and, past the first, its tab:
 *
 *   /                              postings (the search's filters stay in the query string)
 *   /jobs/linkedin-4458087343/cv   …with that posting's sheet open on its CV tab
 *   /applications                  applications
 *   /applications/linkedin-4458087343/notes
 *   /profile
 *
 * A LinkedIn or Indeed posting has the same id on both pages: its board and the board's own
 * id. An application with no such link uses its number ("app-12").
 */
import type { Application } from "@/lib/applications"
import { postingKey } from "@/lib/job-link"

export type Page = "jobs" | "applications" | "profile"
export const JOB_TABS = ["posting", "fit", "cv"] as const
export type JobTab = (typeof JOB_TABS)[number]
export const APP_TABS = ["progress", "fit", "notes", "posting", "cv"] as const
export type AppTab = (typeof APP_TABS)[number]

export type Route =
  | { page: "jobs"; item: string | null; tab: JobTab }
  | { page: "applications"; item: string | null; tab: AppTab }
  | { page: "profile" }

// The boards' own ids, as the link parsers accept them (LinkedIn's are digits, Indeed's hex).
const ITEM = /^(linkedin-\d{1,20}|indeed-[0-9a-f]{1,40}|app-\d+)$/

/** The route a path shows; null for an address the app doesn't have. */
export function parseRoute(pathname: string): Route | null {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent)
  const [section, item, tab, ...rest] = parts
  if (rest.length) return null
  if (!section) return { page: "jobs", item: null, tab: "posting" }
  if (section === "profile") return parts.length === 1 ? { page: "profile" } : null
  const tabs: readonly string[] = section === "jobs" ? JOB_TABS : section === "applications" ? APP_TABS : []
  if (!tabs.length) return null
  if (item !== undefined && !ITEM.test(item)) return null
  if (section === "jobs" && (item === undefined || item.startsWith("app-"))) return null
  // The first tab is the plain address: /jobs/<id>, not /jobs/<id>/posting.
  if (tab !== undefined && (!tabs.includes(tab) || tab === tabs[0])) return null
  if (section === "jobs") return { page: "jobs", item: item!, tab: (tab ?? "posting") as JobTab }
  return { page: "applications", item: item ?? null, tab: (tab ?? "progress") as AppTab }
}

export function routePath(r: Route): string {
  if (r.page === "profile") return "/profile"
  const base = r.page === "jobs" ? "" : "/applications"
  if (!r.item) return base || "/"
  const first = r.page === "jobs" ? JOB_TABS[0] : APP_TABS[0]
  return `${r.page === "jobs" ? "/jobs" : base}/${encodeURIComponent(r.item)}${r.tab === first ? "" : `/${r.tab}`}`
}

/** "linkedin-4458087343" for a LinkedIn or Indeed posting's link; null for any other site. */
export function postingItem(url: string): string | null {
  const key = postingKey(url)
  const m = /^(linkedin|indeed):(.+)$/.exec(key)
  return m ? `${m[1]}-${m[2]}` : null
}

/** The board link a posting id stands for: what the server looks the saved posting up by. */
export function postingUrl(item: string): { url: string; site: "linkedin" | "indeed" } | null {
  const m = /^(linkedin|indeed)-(.+)$/.exec(item)
  if (!m) return null
  // The server finds a saved Indeed posting by its key whatever the country host it was saved
  // under; this one is only what "open on Indeed" shows for one that isn't saved.
  return m[1] === "linkedin"
    ? { url: `https://www.linkedin.com/jobs/view/${m[2]}`, site: "linkedin" }
    : { url: `https://www.indeed.com/viewjob?jk=${m[2]}`, site: "indeed" }
}

/** An application's id in the address: its posting's when it has a board link. */
export function applicationItem(app: Pick<Application, "id" | "site" | "url">): string {
  return (app.site !== "other" && app.url && postingItem(app.url)) || `app-${app.id}`
}

/** The application an address names: by its posting's id, or by its number ("app-12"). */
export function findApplication<T extends Pick<Application, "id" | "site" | "url">>(
  apps: T[],
  item: string | null,
): T | null {
  if (!item) return null
  const n = /^app-(\d+)$/.exec(item)
  return apps.find((a) => (n ? a.id === Number(n[1]) : applicationItem(a) === item)) ?? null
}

/** Addresses from before pages had paths (?view=profilo, ?view=candidature&app=12). */
export function legacyPath(search: string): string | null {
  const q = new URLSearchParams(search)
  const view = q.get("view")
  if (view === "profilo") return "/profile"
  if (view !== "candidature") return null
  const app = q.get("app")
  return app && /^\d+$/.test(app) ? `/applications/app-${app}` : "/applications"
}
