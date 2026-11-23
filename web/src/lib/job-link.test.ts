import { describe, expect, it } from "vitest"

import { recognize } from "@/lib/job-link"

describe("job links", () => {
  it("recognise LinkedIn and Indeed postings like the server", () => {
    for (const url of [
      "https://www.linkedin.com/jobs/view/4123456789/",
      "https://it.linkedin.com/jobs/view/senior-backend-engineer-at-acme-4123456789?trk=x",
      "linkedin.com/jobs/view/4123456789",
      "https://www.linkedin.com/jobs/search/?currentJobId=4123456789&keywords=go",
      "https://www.linkedin.com/comm/jobs/view/4123456789",
    ])
      expect(recognize(url), url).toEqual({ site: "linkedin" })
    expect(recognize("https://it.indeed.com/viewjob?jk=0123456789abcdef")).toEqual({ site: "indeed" })
    for (const url of ["https://www.linkedin.com/in/someone", "https://evil-linkedin.com/jobs/view/4123456789", "jobs.example.com/1", "ciao"])
      expect(recognize(url), url).toBeNull()
  })
})
