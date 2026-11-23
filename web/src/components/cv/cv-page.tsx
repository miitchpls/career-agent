import { useEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { Skeleton } from "@/components/ui/skeleton"
import { api, type CvTemplate } from "@/lib/api"
import { cn } from "@/lib/utils"

// The page at 96 dpi: what the template lays out, before scaling it to the space we have.
const PAGE = { a4: { w: 794, h: 1123 }, letter: { w: 816, h: 1056 } }

export interface CvPageProps {
  template: CvTemplate
  language: "it" | "en" | "de"
  format: "a4" | "letter"
  photo: boolean
  /** null: the sample profile. */
  profile: unknown | null
  className?: string
}

/** The first page of a CV as it prints, rendered by the server from a career-ops template and scaled to fit. */
export function CvPage({ template, language, format, photo, profile, className }: CvPageProps) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const body = { template, language, format, photo, profile }
  const preview = useQuery({
    queryKey: ["cv-preview", body],
    queryFn: () => api.cv.preview(body),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  const page = PAGE[format]
  const scale = width / page.w

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden bg-white", className)}
      style={{ aspectRatio: `${page.w} / ${page.h}` }}
    >
      {preview.data ? (
        <iframe
          title={template}
          srcDoc={preview.data.html}
          // No scripts, no access to the app: the document is only looked at.
          sandbox=""
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: page.w, height: page.h, transform: `scale(${scale})` }}
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
