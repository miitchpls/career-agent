/** The AI CLIs found on this computer, shared by the preferences and the profile import. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, type AiEngines, type AiProvider } from "@/lib/api"

export function useAiEngines() {
  return useQuery({ queryKey: ["ai"], queryFn: api.ai.get, staleTime: 30_000 })
}

export function useChooseAi() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, model }: { provider: string; model: string | null }) => api.ai.choose(provider, model),
    onSuccess: (data) => client.setQueryData(["ai"], data),
  })
}

/** The engine an import would use now, with the label of its model. */
export function activeEngine(data: AiEngines | undefined): { provider: AiProvider; model: string | null } | null {
  const active = data?.active
  const provider = active && data.providers.find((p) => p.id === active.provider)
  if (!provider) return null
  return { provider, model: provider.models.find((m) => m.id === active.model)?.label ?? active.model }
}
