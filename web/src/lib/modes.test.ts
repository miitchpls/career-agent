import { describe, expect, it } from "vitest"

import { joinModes, splitModes } from "@/lib/modes"

describe("modes encoding", () => {
  it("defaults to including postings without a stated mode", () => {
    expect(splitModes([])).toEqual({ known: [], includeUnknown: true })
  })

  it("reads the include-unknown flag from the list", () => {
    expect(splitModes(["onsite", "unknown"])).toEqual({ known: ["onsite"], includeUnknown: true })
    expect(splitModes(["onsite"])).toEqual({ known: ["onsite"], includeUnknown: false })
  })

  it("encodes back, with no modes meaning any", () => {
    expect(joinModes(["hybrid"], true)).toEqual(["hybrid", "unknown"])
    expect(joinModes(["hybrid"], false)).toEqual(["hybrid"])
    expect(joinModes([], false)).toEqual([])
  })
})
