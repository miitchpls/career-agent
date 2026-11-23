import { useEffect, useState } from "react"
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { api, type Direction, type PlaceOption, type Query, type Sort } from "@/lib/api"
import { useLocale } from "@/lib/i18n"

const PAGE = 50

export function useJobs(query: Query, sort: Sort, direction: Direction) {
  return useInfiniteQuery({
    queryKey: ["jobs", query, sort, direction],
    // Later pages reuse the first page's `as_of`, so rows a running search inserts
    // don't shift them; a refetch (on invalidation) starts a fresh snapshot.
    queryFn: ({ pageParam }) => api.jobs(query, sort, direction, pageParam.offset, pageParam.asOf, PAGE),
    initialPageParam: { offset: 0, asOf: null as number | null },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total ? { offset: loaded, asOf: pages[0].as_of } : undefined
    },
    placeholderData: keepPreviousData,
  })
}

export function useRunStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: (q) => (q.state.data?.running ? 1500 : false),
  })
}


export function useSaved() {
  return useQuery({ queryKey: ["saved"], queryFn: api.saved.list })
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** City autocomplete (the server falls back to an offline catalogue if geocoding is down). */
export function usePlaces(text: string): { places: PlaceOption[]; loading: boolean } {
  const q = useDebounced(text.trim(), 180)
  const locale = useLocale() // names come back in the UI's language
  const res = useQuery({
    queryKey: ["places", locale, q.toLowerCase()],
    queryFn: () => api.places(q),
    enabled: q.length >= 2,
    staleTime: Infinity,
    retry: 0,
    placeholderData: keepPreviousData,
  })
  if (text.trim().length < 2) return { places: [], loading: false }
  return { places: res.data?.places ?? [], loading: res.isFetching || q !== text.trim() }
}
