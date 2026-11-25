import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { api, type CvPreviewRequest } from "@/lib/api"
import { useCvPrefs } from "@/lib/cv-prefs"

/**
 * CV pages rendered by the server: one request for every template asked. The server applies
 * the saved photo shape, so it's part of the key: changing it redraws the pages.
 */
export function useCvPreview(req: CvPreviewRequest) {
  const { photoStyle } = useCvPrefs()
  return useQuery({
    queryKey: ["cv-preview", req, photoStyle],
    queryFn: () => api.cv.preview(req),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}
