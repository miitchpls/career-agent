import { useEffect, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// The page at 96 dpi: what the template lays out, before scaling it to the space we have.
const PAGE = { a4: { w: 794, h: 1123 }, letter: { w: 816, h: 1056 } }

/** The first page of a CV as it prints, scaled to the width available. */
export function CvPage({ html, format, className }: { html: string | undefined; format: "a4" | "letter"; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const page = PAGE[format]

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden bg-white", className)}
      style={{ aspectRatio: `${page.w} / ${page.h}` }}
    >
      {html ? (
        <iframe
          title="CV"
          srcDoc={html}
          // No scripts, no access to the app: the document is only looked at.
          sandbox=""
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: page.w, height: page.h, transform: `scale(${width / page.w})` }}
        />
      ) : (
        <div className="space-y-2 p-[8%]">
          <Skeleton className="h-4 w-1/2 bg-neutral-200" />
          <Skeleton className="h-2.5 w-1/3 bg-neutral-200" />
          <Skeleton className="mt-6 h-2 w-full bg-neutral-100" />
          <Skeleton className="h-2 w-5/6 bg-neutral-100" />
          <Skeleton className="h-2 w-4/6 bg-neutral-100" />
        </div>
      )}
    </div>
  )
}
