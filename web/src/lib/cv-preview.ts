import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { api, type CvPreviewRequest } from "@/lib/api"

/** CV pages rendered by the server: one request for every template asked. */
export function useCvPreview(req: CvPreviewRequest) {
  return useQuery({
    queryKey: ["cv-preview", req],
    queryFn: () => api.cv.preview(req),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}
