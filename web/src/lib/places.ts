import type { Place, PlaceOption } from "@/lib/api"

export function samePlace(a: Place, b: Place): boolean {
  if (a.geo_id && b.geo_id) return a.geo_id === b.geo_id
  return a.city.toLowerCase() === b.city.toLowerCase() && a.country === b.country
}

export const toPlace = (o: PlaceOption): Place => ({
  city: o.city,
  country: o.country,
  region: o.region,
  geo_id: o.geo_id,
})
