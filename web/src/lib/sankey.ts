/**
 * The applications' flow as a Sankey, read left to right: sent → first contact → interview,
 * then every ending in one column on the right (offer, rejected, no reply, withdrawn), each
 * named once. An application still waiting has no band out of the step it's at: that part
 * of the step's bar simply doesn't continue.
 */
import { statusOf, visited, wasSent, type Application } from "@/lib/applications-mock"
import { msgs } from "@/lib/i18n"

/** The steps drawn as columns; an application past the last one got an offer. */
export const STAGES = ["applied", "screening", "interview"] as const
export type Stage = (typeof STAGES)[number]
/** The endings, in the right-hand column, top to bottom. */
export const ENDS = ["offer", "rejected", "withdrawn", "ghosted"] as const
export type End = (typeof ENDS)[number]
export type NodeKind = Stage | End

export interface FlowNode {
  id: NodeKind
  col: number
  /** Applications that reached it. */
  value: number
  /** For a stage: those still waiting there (no band out). */
  waiting: number
}

export interface FlowLink {
  source: NodeKind
  target: NodeKind
  value: number
}

export const isEnd = (k: NodeKind): k is End => (ENDS as readonly string[]).includes(k)
const colOf = (k: NodeKind) => (isEnd(k) ? STAGES.length : STAGES.indexOf(k))

/**
 * The bands an application follows; [] if it was never sent. Only through the steps it went
 * through: one moved straight from sent to offer draws one band, not an invented interview.
 */
export function trail(a: Application): [NodeKind, NodeKind][] {
  const steps = visited(a)
  if (!steps.length) return []
  // Every sent application starts at "sent", even if its status jumped past it.
  const path = [0, ...steps.filter((i) => i > 0 && i < STAGES.length)].map((i) => STAGES[i])
  const out: [NodeKind, NodeKind][] = []
  for (let i = 1; i < path.length; i++) out.push([path[i - 1], path[i]])
  const last = path[path.length - 1]
  const s = statusOf(a)
  // An offer turned down later still shows as an offer: it's where the process got to.
  if (steps.includes(3)) out.push([last, "offer"])
  else if (isEnd(s as NodeKind)) out.push([last, s as End])
  return out
}

/** A node or a band of the chart, picked to filter the list. */
export type FlowPick = { node: NodeKind } | { source: NodeKind; target: NodeKind }

export const samePick = (a: FlowPick | null, b: FlowPick) => !!a && JSON.stringify(a) === JSON.stringify(b)

/** Whether an application's band goes through what was picked. */
export function passes(a: Application, pick: FlowPick): boolean {
  if ("node" in pick && pick.node === "applied") return wasSent(a)
  const t = trail(a)
  if ("node" in pick) return t.some(([s, d]) => s === pick.node || d === pick.node)
  return t.some(([s, d]) => s === pick.source && d === pick.target)
}

export function nodeName(k: NodeKind): string {
  const t = msgs().applications
  return isEnd(k) ? t.ends[k] : t.steps[k]
}

/** "Interview", or for a band "Interview → Rejected". */
export const pickName = (pick: FlowPick) =>
  "node" in pick ? nodeName(pick.node) : `${nodeName(pick.source)} → ${nodeName(pick.target)}`

/** Nodes and links from the applications that were sent. */
export function flows(apps: Application[]): { nodes: FlowNode[]; links: FlowLink[] } {
  const links = new Map<string, FlowLink>()
  const inflow = new Map<NodeKind, number>()
  const outflow = new Map<NodeKind, number>()
  for (const a of apps)
    for (const [source, target] of trail(a)) {
      const key = `${source}>${target}`
      const l = links.get(key) ?? { source, target, value: 0 }
      l.value++
      links.set(key, l)
      outflow.set(source, (outflow.get(source) ?? 0) + 1)
      inflow.set(target, (inflow.get(target) ?? 0) + 1)
    }
  const sent = apps.filter(wasSent).length
  const nodes: FlowNode[] = []
  for (const k of [...STAGES, ...ENDS]) {
    const value = k === "applied" ? sent : (inflow.get(k) ?? 0)
    if (!value) continue
    nodes.push({ id: k, col: colOf(k), value, waiting: isEnd(k) ? 0 : value - (outflow.get(k) ?? 0) })
  }
  return { nodes, links: [...links.values()] }
}

// --- Layout ----------------------------------------------------------------------------------

export interface LaidNode extends FlowNode {
  x: number
  y: number
  h: number
}

export interface LaidLink extends FlowLink {
  sy0: number
  sy1: number
  ty0: number
  ty1: number
  path: string
}

export const NODE_W = 8

/**
 * Positions in a `width` × `height` box. The steps run along the top, each a little lower
 * than the one before, so the main flow reads left to right and curves; the endings are a
 * column on the right, centred. Bands leave a node in the order of their targets and enter
 * in the order they left, so no two cross at a node, and the early exits pass under the
 * later steps rather than through them.
 */
export function layout(
  data: { nodes: FlowNode[]; links: FlowLink[] },
  width: number,
  height: number,
  gap = 24,
  drop = 10,
): { nodes: LaidNode[]; links: LaidLink[] } {
  if (!data.nodes.length) return { nodes: [], links: [] }
  const cols = STAGES.length + 1
  const ends = data.nodes.filter((n) => isEnd(n.id))
  const stages = data.nodes.filter((n) => !isEnd(n.id))
  const endsSum = ends.reduce((s, n) => s + n.value, 0)
  // One scale for every node, so a band keeps its thickness end to end. The steps take
  // about three quarters of the height: the room left under them is where the early exits
  // run down to their ending without passing behind a later step.
  const scale = Math.min(
    ...stages.map((n) => (height * 0.75 - drop * n.col) / n.value),
    endsSum ? (height - gap * (ends.length - 1)) / endsSum : Infinity,
  )
  const step = (width - NODE_W) / (cols - 1)
  const laid = new Map<NodeKind, LaidNode>()
  for (const n of stages) laid.set(n.id, { ...n, x: n.col * step, y: n.col * drop, h: Math.max(n.value * scale, 2) })
  const endsH = ends.reduce((s, n) => s + Math.max(n.value * scale, 2), 0) + gap * Math.max(ends.length - 1, 0)
  let y = height - endsH // bottom-aligned: the early exits go down, under the later steps
  for (const n of ends) {
    const h = Math.max(n.value * scale, 2)
    laid.set(n.id, { ...n, x: (cols - 1) * step, y, h })
    y += h + gap
  }

  // Leaving: top to bottom by target (the next step first, then the endings in order).
  const rank = (k: NodeKind) => (isEnd(k) ? STAGES.length + ENDS.indexOf(k) : STAGES.indexOf(k))
  const sy = new Map<FlowLink, number>()
  const outUsed = new Map<NodeKind, number>()
  for (const l of [...data.links].sort((a, b) => rank(a.target) - rank(b.target))) {
    const s = laid.get(l.source)!
    const off = outUsed.get(s.id) ?? 0
    sy.set(l, s.y + off)
    outUsed.set(s.id, off + l.value * scale)
  }
  // Entering: top to bottom in the order the bands left, by height.
  const inUsed = new Map<NodeKind, number>()
  const out: LaidLink[] = []
  for (const l of [...data.links].sort((a, b) => sy.get(a)! - sy.get(b)!)) {
    const s = laid.get(l.source)!
    const t = laid.get(l.target)!
    const h = l.value * scale
    const sy0 = sy.get(l)!
    const ty0 = t.y + (inUsed.get(t.id) ?? 0)
    inUsed.set(t.id, (inUsed.get(t.id) ?? 0) + h)
    const sx = s.x + NODE_W
    const tx = t.x
    const mx = (sx + tx) / 2
    const path = [
      `M${sx},${sy0}`,
      `C${mx},${sy0} ${mx},${ty0} ${tx},${ty0}`,
      `L${tx},${ty0 + h}`,
      `C${mx},${ty0 + h} ${mx},${sy0 + h} ${sx},${sy0 + h}`,
      "Z",
    ].join(" ")
    out.push({ ...l, sy0, sy1: sy0 + h, ty0, ty1: ty0 + h, path })
  }
  return { nodes: [...laid.values()], links: out }
}
