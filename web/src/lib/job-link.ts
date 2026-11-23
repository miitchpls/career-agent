/**
 * Pasted job links, recognised in the browser so the field can say which board it is before
 * anything is asked (mirrors `career_agent.job_link.parse`; the server decides).
 */
export type LinkSite = "linkedin" | "indeed"

export function recognize(raw: string): { site: LinkSite } | null {
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const id = u.searchParams.get("currentJobId") ?? /^(?:\/comm)?\/jobs\/view\/(?:.*-)?(\d{6,12})\/?$/.exec(u.pathname)?.[1]
    return id && /^\d+$/.test(id) ? { site: "linkedin" } : null
  }
  if (/(^|\.)indeed\.[a-z.]+$/.test(host)) {
    const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk")
    return jk && /^[0-9a-f]{8,32}$/.test(jk) ? { site: "indeed" } : null
  }
  return null
}
