import { useMemo, useRef, useState } from "react"

import { wasSent, type Application } from "@/lib/applications"
import { useT } from "@/lib/i18n"
import {
  flows,
  isEnd,
  layout,
  NODE_W,
  nodeName,
  samePick,
  type FlowPick,
  type LaidLink,
  type LaidNode,
  type NodeKind,
} from "@/lib/sankey"
import { cn } from "@/lib/utils"

const W = 1000
const H = 300
const LABELS = 170 // room right of the endings for their labels
const PAD_TOP = 26 // a step's label sits above it

/**
 * Status colours (the data-viz reference status palette: good / critical, fixed in both
 * themes), on the endings only: the eye follows the flow in the text colour and lands on the
 * outcome. Every node is labelled, so colour never carries meaning alone.
 */
const TONE: Partial<Record<NodeKind, string>> = { offer: "#0ca30c", rejected: "#d03b3b" }
const GREY: NodeKind[] = ["ghosted", "withdrawn"]

type Hover = { kind: "link"; link: LaidLink } | { kind: "node"; node: LaidNode }

const pickOf = (h: Hover): FlowPick =>
  h.kind === "node" ? { node: h.node.id } : { source: h.link.source, target: h.link.target }

const touches = (l: LaidLink, pick: FlowPick) =>
  "node" in pick ? l.source === pick.node || l.target === pick.node : l.source === pick.source && l.target === pick.target

/**
 * Sent → first contact → interview, then where each application ended. A click on a node or
 * a band picks it (the list below shows those applications); again, unpicks it.
 */
export function FlowChart({
  apps,
  pick,
  onPick,
}: {
  apps: Application[]
  pick: FlowPick | null
  onPick: (p: FlowPick | null) => void
}) {
  const t = useT().applications
  const [hover, setHover] = useState<{ h: Hover; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const sent = apps.filter(wasSent).length
  const data = useMemo(() => flows(apps), [apps])
  const { nodes, links } = useMemo(() => layout(data, W - LABELS, H - PAD_TOP), [data])
  const pct = (v: number) => (sent ? Math.round((v / sent) * 100) : 0)

  const track = (h: Hover) => (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setHover({ h, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const toggle = (p: FlowPick) => onPick(samePick(pick, p) ? null : p)
  // What's lit: the hovered mark, else the picked one, else everything.
  const focus = hover ? pickOf(hover.h) : pick
  const lit = (l: LaidLink) => !focus || touches(l, focus)
  const nodeLit = (n: LaidNode) =>
    !focus || ("node" in focus && focus.node === n.id) || links.some((l) => lit(l) && (l.source === n.id || l.target === n.id))

  if (!sent) return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{t.flowEmpty}</p>

  const tip = hover?.h
  const tipValue = tip ? (tip.kind === "link" ? tip.link.value : tip.node.value) : 0

  return (
    <div ref={box} className="relative" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible text-foreground" role="group" aria-label={t.flowTitle}>
        <g transform={`translate(0 ${PAD_TOP})`}>
          <defs>
            {links.map((l) => {
              const s = nodes.find((n) => n.id === l.source)!
              const d = nodes.find((n) => n.id === l.target)!
              const tone = TONE[l.target]
              return (
                <linearGradient key={l.source + l.target} id={`g-${l.source}-${l.target}`} gradientUnits="userSpaceOnUse" x1={s.x + NODE_W} x2={d.x} y1={0} y2={0}>
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.12} />
                  <stop offset="100%" stopColor={tone ?? "currentColor"} stopOpacity={tone ? 0.5 : 0.12} />
                </linearGradient>
              )
            })}
          </defs>
          {links.map((l) => {
            const strong = !!focus && lit(l)
            return (
              <path
                key={`${l.source}>${l.target}`}
                d={l.path}
                // Grey where the band starts, the colour of its ending where it arrives: the
                // left stays calm and the eye lands on where applications end up.
                fill={`url(#g-${l.source}-${l.target})`}
                className="cursor-pointer transition-opacity duration-150"
                opacity={!lit(l) ? 0.2 : strong ? 1 : 0.85}
                onPointerMove={track({ kind: "link", link: l })}
                onClick={() => toggle({ source: l.source, target: l.target })}
              />
            )
          })}
          {nodes.map((n) => {
            const end = isEnd(n.id)
            const picked = samePick(pick, { node: n.id })
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-pressed={picked}
                aria-label={`${nodeName(n.id)} ${n.value}`}
                className={cn("cursor-pointer outline-none transition-opacity duration-150", !nodeLit(n) && "opacity-40")}
                onPointerMove={track({ kind: "node", node: n })}
                onClick={() => toggle({ node: n.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    toggle({ node: n.id })
                  }
                }}
              >
                {/* A wider invisible target than the 8px bar. */}
                <rect x={n.x - 6} y={n.y} width={NODE_W + 12} height={n.h} fill="transparent" />
                <rect
                  x={n.x}
                  y={n.y}
                  width={NODE_W}
                  height={n.h}
                  rx={2}
                  strokeWidth={3}
                  stroke={picked ? "currentColor" : "transparent"}
                  fill={TONE[n.id] ?? "currentColor"}
                  opacity={GREY.includes(n.id) ? 0.35 : 1}
                />
                {/* Steps: label above (bands leave to the right). Endings: label beside. */}
                <text
                  x={end ? n.x + NODE_W + 10 : n.x}
                  y={end ? n.y + n.h / 2 : n.y - 9}
                  dominantBaseline={end ? "middle" : "auto"}
                  className="fill-foreground stroke-card text-[13px] [paint-order:stroke] [stroke-linejoin:round] [stroke-width:4px]"
                >
                  <tspan className="font-medium">{nodeName(n.id)}</tspan>
                  <tspan dx={6} className="fill-muted-foreground tabular-nums">
                    {n.value}
                  </tspan>
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {tip && hover && (
        <div
          className="pointer-events-none absolute z-10 space-y-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p>
            <span className="font-medium">
              {tip.kind === "link" ? `${nodeName(tip.link.source)} → ${nodeName(tip.link.target)}` : nodeName(tip.node.id)}
            </span>
            <span className="ml-2 tabular-nums">{tipValue}</span>
            <span className="ml-1.5 text-muted-foreground tabular-nums">· {t.pctOfSent(pct(tipValue))}</span>
          </p>
          {tip.kind === "node" && tip.node.waiting > 0 && <p className="text-muted-foreground">{t.waiting(tip.node.waiting)}</p>}
          <p className="text-muted-foreground">{samePick(pick, pickOf(tip)) ? t.unpickHint : t.pickHint}</p>
        </div>
      )}
    </div>
  )
}
