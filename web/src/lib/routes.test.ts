import { describe, expect, it } from "vitest"

import { applicationItem, findApplication, legacyPath, parseRoute, postingItem, postingUrl, routePath } from "@/lib/routes"

describe("routes", () => {
  it("reads every page, posting and tab, and writes them back the same", () => {
    const paths = [
      "/",
      "/jobs/linkedin-4458087343",
      "/jobs/linkedin-4458087343/cv",
      "/jobs/indeed-0a1b2c3d4e5f6a7b/fit",
      "/applications",
      "/applications/linkedin-4458087343",
      "/applications/app-12/notes",
      "/profile",
    ]
    for (const p of paths) expect(routePath(parseRoute(p)!)).toBe(p)
    expect(parseRoute("/jobs/linkedin-4458087343/cv")).toEqual({ page: "jobs", item: "linkedin-4458087343", tab: "cv" })
  })

  it("refuses addresses the app doesn't have", () => {
    for (const p of [
      "/nope",
      "/jobs",
      "/jobs/app-3",
      "/jobs/linkedin-/cv",
      "/jobs/linkedin-4458087343/notes",
      "/jobs/linkedin-4458087343/posting", // the first tab is the plain address
      "/applications/x",
      "/profile/me",
      "/jobs/linkedin-4458087343/cv/more",
    ])
      expect(parseRoute(p), p).toBeNull()
  })

  it("gives a posting the same id on both pages", () => {
    const url = "https://ch.linkedin.com/jobs/view/full-stack-engineer-4458087343/?trk=x"
    expect(postingItem(url)).toBe("linkedin-4458087343")
    expect(postingItem("https://it.indeed.com/viewjob?jk=0a1b2c3d4e5f6a7b")).toBe("indeed-0a1b2c3d4e5f6a7b")
    expect(postingItem("https://careers.acme.ch/jobs/1")).toBeNull()
    expect(postingUrl("linkedin-4458087343")).toEqual({ url: "https://www.linkedin.com/jobs/view/4458087343", site: "linkedin" })
    expect(applicationItem({ id: 3, site: "linkedin", url: url })).toBe("linkedin-4458087343")
    expect(applicationItem({ id: 3, site: "other", url: "https://careers.acme.ch/jobs/1" })).toBe("app-3")
  })

  it("finds an application by its posting or its number", () => {
    const apps = [
      { id: 1, site: "linkedin" as const, url: "https://www.linkedin.com/jobs/view/4458087343" },
      { id: 2, site: "other" as const, url: "" },
    ]
    expect(findApplication(apps, "linkedin-4458087343")?.id).toBe(1)
    expect(findApplication(apps, "app-1")?.id).toBe(1) // a number works for any of them
    expect(findApplication(apps, "app-2")?.id).toBe(2)
    expect(findApplication(apps, "linkedin-1111111111")).toBeNull()
  })

  it("moves the old ?view= addresses to their pages", () => {
    expect(legacyPath("?view=profilo")).toBe("/profile")
    expect(legacyPath("?view=candidature&app=12")).toBe("/applications/app-12")
    expect(legacyPath("?view=candidature")).toBe("/applications")
    expect(legacyPath("?title=go")).toBeNull()
  })
})
