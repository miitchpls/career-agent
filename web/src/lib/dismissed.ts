import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, type Job } from "@/lib/api"
import { useT } from "@/lib/i18n"

/** The postings the user hid ("not interested"): one list for the results and the sheet. */
const KEY = ["dismissed"]
/** Hiding and restoring run one after the other: an undo can't reach the server first. */
const SCOPE = { id: "dismissed" }
const EMPTY: ReadonlySet<string> = new Set()
const toSet = (d: { urls: string[] }): ReadonlySet<string> => new Set(d.urls)

type Hideable = Pick<Job, "url" | "site" | "title" | "company">

/**
 * The hidden postings' links. `ready` is false until the list arrived: until then the results
 * wait, or the hidden rows would show and then leave.
 */
export function useDismissed(): { urls: ReadonlySet<string>; ready: boolean } {
  // No retry: a failed list doesn't hold the results up (nothing is hidden then); the next
  // hide or restore refetches it.
  const q = useQuery({ queryKey: KEY, queryFn: api.dismissed.list, select: toSet, staleTime: Infinity, retry: false })
  return { urls: q.data ?? EMPTY, ready: !q.isPending }
}

/** Hide a posting (with a toast to undo it) or show it again. The list changes at once. */
export function useDismiss() {
  const client = useQueryClient()
  const t = useT().jobs
  const edit = (change: (urls: string[]) => string[]) => {
    void client.cancelQueries({ queryKey: KEY })
    client.setQueryData<{ urls: string[] }>(KEY, (d) => ({ urls: change(d?.urls ?? []) }))
  }
  const add = (url: string) => edit((urls) => (urls.includes(url) ? urls : [url, ...urls]))
  const drop = (url: string) => edit((urls) => urls.filter((u) => u !== url))
  // The server's list once nothing else is on its way (a refetch mid-way would undo a change).
  const settle = () => {
    if (client.isMutating({ mutationKey: KEY }) <= 1) void client.invalidateQueries({ queryKey: KEY })
  }

  const hiding = useMutation({
    mutationKey: KEY,
    scope: SCOPE,
    mutationFn: (job: Hideable) => api.dismissed.add(job),
    onError: (e, job) => {
      drop(job.url)
      toast.error(t.hideFailed, { id: toastId(job.url), description: e.message })
    },
    onSettled: settle,
  })
  const restoring = useMutation({
    mutationKey: KEY,
    scope: SCOPE,
    mutationFn: (url: string) => api.dismissed.remove(url),
    onError: (e, url) => {
      add(url)
      toast.error(t.restoreFailed, { id: toastId(url), description: e.message })
    },
    onSettled: settle,
  })

  const restore = (url: string) => {
    drop(url)
    restoring.mutate(url)
    toast.dismiss(toastId(url))
  }
  const hide = (job: Hideable) => {
    add(job.url)
    hiding.mutate(job)
    toast(t.hidden, {
      id: toastId(job.url),
      description: [job.title, job.company].filter(Boolean).join(" · "),
      action: { label: t.undo, onClick: () => restore(job.url) },
    })
  }
  return { hide, restore }
}

const toastId = (url: string) => `dismissed:${url}`
