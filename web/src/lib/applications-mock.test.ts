import { describe, expect, it } from "vitest"

import { applicationsStore, sameUrl, statusOf } from "@/lib/applications-mock"

describe("applications added by hand", () => {
  it("go to the top with their first status, and are found again by link", () => {
    const before = applicationsStore.get().length
    const id = applicationsStore.add(
      { title: "Go Engineer", company: "Acme", location: "Lugano", site: "other", url: "https://jobs.acme.ch/go?ref=x", score: null, cv: null },
      "applied",
    )
    const list = applicationsStore.get()
    expect(list).toHaveLength(before + 1)
    expect(list[0].id).toBe(id)
    expect(statusOf(list[0])).toBe("applied")
    expect(applicationsStore.byUrl("jobs.acme.ch/go/")?.id).toBe(id)
    expect(applicationsStore.byUrl("")).toBeUndefined()
  })

  it("match links whatever the tracking parameters", () => {
    expect(sameUrl("https://www.linkedin.com/jobs/view/1234567?trk=a", "linkedin.com/jobs/view/1234567/")).toBe(true)
    expect(sameUrl("https://it.indeed.com/viewjob?jk=0123456789abcdef&from=serp", "https://it.indeed.com/viewjob?jk=0123456789abcdef")).toBe(true)
    expect(sameUrl("https://it.indeed.com/viewjob?jk=0123456789abcdef", "https://it.indeed.com/viewjob?jk=fedcba9876543210")).toBe(false)
    // Every form a board's link takes.
    expect(sameUrl("linkedin.com/jobs/search?currentJobId=1111111", "linkedin.com/jobs/search?currentJobId=2222222")).toBe(false)
    expect(sameUrl("https://www.linkedin.com/jobs/view/1234567", "https://it.linkedin.com/jobs/view/backend-eng-1234567")).toBe(true)
    expect(sameUrl("https://it.indeed.com/jobs?q=go&vjk=0123456789abcdef", "https://it.indeed.com/viewjob?jk=0123456789abcdef")).toBe(true)
  })
})
