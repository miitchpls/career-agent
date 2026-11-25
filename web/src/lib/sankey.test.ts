import { describe, expect, it } from "vitest"

import { summary, type Application, type AppStatus } from "@/lib/applications"
import { flows, layout, passes, pickName } from "@/lib/sankey"
import { setLocale } from "@/lib/i18n"

let next = 1
const app = (...statuses: AppStatus[]): Application => ({
  id: next++,
  title: "t",
  company: "c",
  location: "l",
  site: "linkedin",
  url: "u",
  score: null,
  cv: null,
  posting: null,
  notes: "",
  events: statuses.map((status, i) => ({ status, at: new Date(2026, 0, i + 1).toISOString() })),
})

describe("applications flow", () => {
  it("climbs the steps and ends each application in one column of endings", () => {
    const { nodes, links } = flows([
      app("saved"), // never sent: not in the flow
      app("saved", "applied"), // waiting: no band out
      app("applied", "rejected"),
      app("applied", "screening", "interview", "offer"),
      app("applied", "screening", "rejected"),
    ])
    const l = Object.fromEntries(links.map((x) => [`${x.source}>${x.target}`, x.value]))
    expect(l).toEqual({
      "applied>rejected": 1,
      "applied>screening": 2,
      "screening>interview": 1,
      "screening>rejected": 1,
      "interview>offer": 1,
    })
    const node = (id: string) => nodes.find((n) => n.id === id)!
    expect(node("applied")).toMatchObject({ value: 4, waiting: 1 })
    // One "rejected", fed from two steps, in the endings' column.
    expect(node("rejected")).toMatchObject({ value: 2, col: 3 })
    expect(node("offer").col).toBe(3)
    expect(nodes.find((n) => n.id === "ghosted")).toBeUndefined()
  })

  it("draws only the steps an application went through", () => {
    const jump = app("saved", "applied", "offer") // moved straight to an offer
    const { links } = flows([jump])
    expect(links.map((l) => `${l.source}>${l.target}`)).toEqual(["applied>offer"])
    expect(summary([jump])).toMatchObject({ sent: 1, interviews: 0, offers: 1, answered: 1 })
    // A status set past "sent" still counts as sent.
    expect(summary([app("saved", "interview")]).sent).toBe(1)
  })

  it("finds the applications behind a node or a band", () => {
    const offer = app("applied", "screening", "interview", "offer")
    const early = app("applied", "rejected")
    const waiting = app("saved", "applied")
    expect(passes(offer, { node: "screening" })).toBe(true)
    expect(passes(early, { node: "screening" })).toBe(false)
    expect(passes(early, { source: "applied", target: "rejected" })).toBe(true)
    expect(passes(waiting, { node: "applied" })).toBe(true) // sent, still waiting
    expect(passes(app("saved"), { node: "applied" })).toBe(false)
    setLocale("it")
    expect(pickName({ node: "rejected" })).toBe("Rifiutata")
    expect(pickName({ source: "interview", target: "rejected" })).toBe("Colloquio → Rifiutata")
  })

  // A spread like a real search: waiting, rejected at each step, ghosted, withdrawn, offers.
  const sample = () => [
    ...Array.from({ length: 3 }, () => app("applied")),
    ...Array.from({ length: 3 }, () => app("applied", "rejected")),
    ...Array.from({ length: 3 }, () => app("applied", "ghosted")),
    ...Array.from({ length: 2 }, () => app("applied", "screening")),
    ...Array.from({ length: 3 }, () => app("applied", "screening", "rejected")),
    app("applied", "screening", "withdrawn"),
    ...Array.from({ length: 2 }, () => app("applied", "screening", "interview", "rejected")),
    ...Array.from({ length: 2 }, () => app("applied", "screening", "interview", "offer")),
    app("saved"),
  ]

  it("keeps a band as thick at both ends and never overlaps nodes in a column", () => {
    const laid = layout(flows(sample()), 800, 300)
    for (const l of laid.links) expect(l.sy1 - l.sy0).toBeCloseTo(l.ty1 - l.ty0)
    const cols = new Map<number, typeof laid.nodes>()
    for (const n of laid.nodes) cols.set(n.col, [...(cols.get(n.col) ?? []), n])
    for (const col of cols.values()) {
      const sorted = [...col].sort((a, b) => a.y - b.y)
      sorted.slice(1).forEach((n, i) => expect(n.y).toBeGreaterThanOrEqual(sorted[i].y + sorted[i].h))
      expect(Math.max(...sorted.map((n) => n.y + n.h))).toBeLessThanOrEqual(300.001)
    }
  })

  it("counts what the header shows", () => {
    const s = summary(sample())
    expect(s).toEqual({ sent: 19, answered: 13, interviews: 4, offers: 2 }) // 10 past sending + 3 rejected at once
  })
})
