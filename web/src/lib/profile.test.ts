import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProfileState } from "@/lib/api"
import {
  EMPTY_PROFILE,
  companyKey,
  groupByCompany,
  groupSpan,
  profileStore,
  reviewCount,
  withoutLegalForm,
  withoutReview,
  type Experience,
  type Profile,
} from "@/lib/profile"
import { toMarkdown } from "@/lib/profile-md"

const draftProfile: Profile = {
  ...EMPTY_PROFILE,
  name: "Giulia Ferri",
  experiences: [
    {
      id: "e1",
      role: "Data Engineer",
      employment: null,
      company: "Lumen",
      location: "Bologna",
      locationType: null,
      start: { month: 3, year: 2022 },
      end: null,
      current: true,
      bullets: ["Pipeline Kafka per 50 milioni di eventi al giorno."],
      skills: ["Kafka"],
      media: [],
      review: "Non ho trovato questo dato nel CV: controlla che sia giusto.",
    },
  ],
  skills: [{ name: "Kafka" }, { name: "AWS", inferred: true }],
}

const state = (patch: Partial<ProfileState>): ProfileState => ({ profile: null, saved_at: null, draft: null, ...patch })
const draft = (status: "running" | "ready" | "failed", data: Profile | null = null) => ({
  id: 1,
  document_id: 1,
  status,
  provider: "claude",
  model: null,
  data,
  error: status === "failed" ? "boom" : null,
  filename: "cv.pdf",
  created_at: "2026-11-23T10:00:00+00:00",
  updated_at: "2026-11-23T10:00:00+00:00",
})

/** A fake server: answers in order and records what the page sent. */
function serve(...answers: ProfileState[]) {
  const sent: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null })
      const next = answers.length > 1 ? answers.shift() : answers[0]
      return new Response(JSON.stringify(next), { status: 200 })
    }),
  )
  return sent
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("profile store", () => {
  it("shows a ready draft for review, keeps edits in the draft, and confirms without review marks", async () => {
    const sent = serve(state({ draft: draft("ready", draftProfile) }))
    await profileStore.load()
    expect(profileStore.get().stage).toBe("review")
    expect(reviewCount(profileStore.get().profile)).toBe(2)

    profileStore.update({ ...profileStore.get().profile, headline: "Data Engineer" })
    await vi.advanceTimersByTimeAsync(700)
    expect(sent.at(-1)).toMatchObject({ url: "/api/profile/draft", method: "PUT" })

    serve(state({ profile: withoutReview(draftProfile), saved_at: "2026-11-23T10:01:00+00:00" }))
    await profileStore.confirmDraft()
    const confirmed = vi.mocked(fetch).mock.calls.at(-1)!
    expect(confirmed[0]).toBe("/api/profile/draft/confirm")
    const body = JSON.parse(String(confirmed[1]!.body)).profile as Profile
    expect(body.headline).toBe("Data Engineer")
    expect(reviewCount(body)).toBe(0)
    expect(profileStore.get().stage).toBe("ready")
  })

  it("follows a running import until it is ready", async () => {
    serve(state({ draft: draft("running") }), state({ draft: draft("ready", draftProfile) }))
    await profileStore.load()
    expect(profileStore.get().stage).toBe("importing")
    await vi.advanceTimersByTimeAsync(1600)
    expect(profileStore.get().stage).toBe("review")
  })

  it("saves edits to the saved profile right away, one request at a time", async () => {
    const sent = serve(state({ profile: draftProfile, saved_at: "2026-11-23T10:00:00+00:00" }))
    await profileStore.load()
    expect(profileStore.get().stage).toBe("ready")
    profileStore.update({ ...draftProfile, name: "A" })
    profileStore.update({ ...draftProfile, name: "B" })
    await vi.advanceTimersByTimeAsync(10)
    const puts = sent.filter((r) => r.method === "PUT")
    expect(puts.map((r) => (r.body as { profile: Profile }).profile.name)).toEqual(["B"])
  })

  it("starts a blank profile without saving anything", async () => {
    const sent = serve(state({}))
    await profileStore.load()
    expect(profileStore.get().stage).toBe("empty")
    profileStore.startBlank()
    expect(profileStore.get().stage).toBe("ready")
    expect(sent.filter((r) => r.method !== "GET")).toEqual([])
  })
})

describe("markdown export", () => {
  it("writes the profile as a CV", () => {
    const md = toMarkdown(draftProfile)
    expect(md).toContain("# Giulia Ferri")
    expect(md).toContain("### Data Engineer — Lumen")
    expect(md).toContain("- Pipeline Kafka per 50 milioni di eventi al giorno.")
    expect(md).toContain("Kafka, AWS")
  })
})

describe("company groups", () => {
  const exp = (id: string, company: string, extra: Partial<Experience> = {}): Experience => ({
    id,
    role: id,
    employment: null,
    company,
    location: "",
    locationType: null,
    start: null,
    end: null,
    current: false,
    bullets: [],
    skills: [],
    media: [],
    ...extra,
  })

  it("compares employers ignoring case, accents, punctuation and legal form", () => {
    expect(companyKey("Acme S.p.A.")).toBe(companyKey("ACME"))
    expect(companyKey("Société Générale SA")).toBe(companyKey("societe generale"))
    expect(companyKey("Glutz AG")).toBe("glutz")
    expect(companyKey("J.P. Morgan")).toBe("jp morgan")
    expect(companyKey("Inc")).toBe("inc")
    expect(companyKey("Acme")).not.toBe(companyKey("Acme Labs"))
  })

  it("drops the legal form from a displayed name", () => {
    expect(withoutLegalForm("Acme S.p.A.")).toBe("Acme")
    expect(withoutLegalForm("Gamma Srl")).toBe("Gamma")
    expect(withoutLegalForm("Initech, Inc.")).toBe("Initech")
    expect(withoutLegalForm("Glutz AG")).toBe("Glutz")
    expect(withoutLegalForm("Co")).toBe("Co")
    expect(withoutLegalForm("Acme Labs")).toBe("Acme Labs")
  })

  it("groups consecutive roles at one employer only", () => {
    const groups = groupByCompany([exp("a", "Acme"), exp("b", "ACME S.r.l."), exp("c", "Beta"), exp("d", "Acme"), exp("e", ""), exp("f", "")])
    expect(groups.map((g) => g.map((e) => e.id))).toEqual([["a", "b"], ["c"], ["d"], ["e"], ["f"]])
  })

  it("spans a group from its earliest start to its latest end", () => {
    const g = [
      exp("a", "Acme", { start: { month: 5, year: 2023 }, end: { month: 1, year: 2025 } }),
      exp("b", "Acme", { start: { month: 0, year: 2020 }, end: { month: 4, year: 2023 } }),
    ]
    expect(groupSpan(g)).toEqual({ start: { month: 0, year: 2020 }, end: { month: 1, year: 2025 }, current: false })
    expect(groupSpan([{ ...g[0], current: true, end: null }, g[1]])).toEqual({ start: { month: 0, year: 2020 }, end: null, current: true })
  })
})
