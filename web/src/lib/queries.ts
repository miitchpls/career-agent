import { useEffect, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { api, type Order, type PlaceOption, type Query } from "@/lib/api"
import { useLocale } from "@/lib/i18n"

/**
 * What the search shows: the board pages the server keeps for a few hours. Reading it never
 * asks a board, so it's refetched freely (filters, a running search adding pages).
 */
export function useFeed(query: Query, order: Order) {
  return useQuery({
    queryKey: ["jobs", query, order],
    queryFn: () => api.feed(query, order),
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
