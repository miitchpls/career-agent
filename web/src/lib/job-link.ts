/**
 * Pasted job links, recognised in the browser so the field can say which board it is before
 * anything is asked (mirrors `career_agent.job_link.parse`; the server decides).
 */
export type LinkSite = "linkedin" | "indeed"

/** A typed address as a URL ("linkedin.com/…" gets its https://); null if it isn't one. */
export function parseUrl(raw: string): URL | null {
  const t = raw.trim()
  if (!t) return null
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
  } catch {
    return null
  }
}

/** "careers.acme.ch" for https://www.careers.acme.ch/…; "" if not an address. */
export const hostOf = (raw: string) => parseUrl(raw)?.hostname.toLowerCase().replace(/^www\./, "") ?? ""

/** The board and its id for the posting a LinkedIn or Indeed link points at. */
function boardPosting(u: URL): { site: LinkSite; id: string } | null {
  const host = u.hostname.toLowerCase()
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const id = u.searchParams.get("currentJobId") ?? /^(?:\/comm)?\/jobs\/view\/(?:.*-)?(\d{6,12})\/?$/.exec(u.pathname)?.[1]
    return id && /^\d+$/.test(id) ? { site: "linkedin", id } : null
  }
  if (/(^|\.)indeed\.[a-z.]+$/.test(host)) {
    const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk")
    return jk && /^[0-9a-f]{8,32}$/.test(jk) ? { site: "indeed", id: jk } : null
  }
  return null
}

export function recognize(raw: string): { site: LinkSite } | null {
  const u = parseUrl(raw)
  const b = u && boardPosting(u)
  return b ? { site: b.site } : null
}

/**
 * One key per posting, whatever form its link takes: a board's own id for LinkedIn and Indeed
 * (/jobs/view/<slug>-<id>, ?currentJobId=, ?jk= or ?vjk=), host and path for any other site.
 */
export function postingKey(raw: string): string {
  const u = parseUrl(raw)
  if (!u) return raw.trim()
  const b = boardPosting(u)
  if (b) return `${b.site}:${b.id}`
  return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`
}
