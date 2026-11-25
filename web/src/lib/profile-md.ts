/** The profile as a Markdown CV: for backups, or for tools that read career-ops' cv.md. */
import { msgs } from "@/lib/i18n"
import { fmtMonthYear, fmtRange, levelLabel, skillCategories, type Profile } from "@/lib/profile"

export function toMarkdown(p: Profile): string {
  const t = msgs().profileView
  const out: string[] = []
  const line = (s = "") => out.push(s)
  const section = (title: string) => {
    line()
    line(`## ${title}`)
    line()
  }

  line(`# ${p.name || "—"}`)
  if (p.headline) line(p.headline)
  const contacts = [p.location, p.email, p.phone, ...p.links.map((l) => l.url)].filter(Boolean)
  if (contacts.length) {
    line()
    line(contacts.join(" · "))
  }
  if (p.summary) {
    section(t.summary)
    line(p.summary)
  }
  if (p.experiences.length) {
    section(t.experiences)
    for (const e of p.experiences) {
      line(`### ${[e.role, e.company].filter(Boolean).join(" — ")}`)
      const meta = [fmtRange(e.start, e.end, e.current), e.location].filter(Boolean).join(" · ")
      if (meta) line(meta)
      if (e.context) line(`*${e.context}*`)
      for (const b of e.bullets) line(`- ${b}`)
      if (e.skills.length) line(`\n${e.skills.join(", ")}`)
      line()
    }
  }
  if (p.education.length) {
    section(t.education)
    for (const d of p.education) {
      line(`### ${d.school}`)
      const what = [d.degree, d.field].filter(Boolean).join(", ")
      const when = [fmtMonthYear(d.start), fmtMonthYear(d.end)].filter(Boolean).join(" – ")
      if (what || when) line([what, when].filter(Boolean).join(" · "))
      if (d.grade) line(t.grade(d.grade))
      if (d.description) line(d.description)
      line()
    }
  }
  if (p.skills.length) {
    section(t.skills)
    // One line per category, as career-ops' cv.md writes them: "- **Frontend:** Angular, React".
    const lines = [...skillCategories(p), ""]
      .map((c) => [c, p.skills.filter((s) => (s.category?.trim() ?? "") === c).map((s) => s.name)] as const)
      .filter(([, names]) => names.length)
    if (lines.length === 1 && !lines[0][0]) line(lines[0][1].join(", "))
    else for (const [c, names] of lines) line(`- **${c || t.noCategory}:** ${names.join(", ")}`)
  }
  if (p.languages.length) {
    section(t.languages)
    for (const l of p.languages) line(`- ${l.name}: ${levelLabel(l.level)}${l.certificate ? ` (${l.certificate})` : ""}`)
  }
  if (p.projects.length) {
    section(t.projects)
    for (const x of p.projects) {
      line(`### ${x.name}`)
      if (x.url) line(x.url)
      if (x.description) line(x.description)
      line()
    }
  }
  if (p.certifications.length) {
    section(t.certifications)
    for (const c of p.certifications) {
      const when = fmtMonthYear(c.issued)
      line(`- ${[c.name, c.issuer, when].filter(Boolean).join(" · ")}`)
    }
  }
  if (p.awards.length) {
    section(t.awards)
    for (const a of p.awards) line(`- ${[a.title, a.issuer, fmtMonthYear(a.date)].filter(Boolean).join(" · ")}`)
  }
  if (p.interests.length) {
    section(t.interests)
    line(p.interests.join(", "))
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

export function downloadMarkdown(p: Profile) {
  const blob = new Blob([toMarkdown(p)], { type: "text/markdown;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `${(p.name || "profile").trim().replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
