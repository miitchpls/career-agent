import { describe, expect, it } from "vitest"

import type { RunStatus, RunStep } from "@/lib/api"
import { offersPhrase, runMessage, stepOutcome } from "@/lib/run-messages"

const step = (over: Partial<RunStep>): RunStep => ({
  site: "linkedin", keyword: "contabile", place: "Lugano", status: "pending", found: 0, new: 0, abroad: 0, off_title: 0, missed: 0, error: null, note: null, ran_at: null, ...over,
})
const status = (over: Partial<RunStatus>): RunStatus => ({
  running: true, started: "t", finished: null, phase: "searching", current: 0, pause_seconds: null,
  steps: [], found: 0, new: 0, done_steps: 0, total_steps: 0, ...over,
})

describe("runMessage", () => {
  it("says what it is searching", () => {
    const r = status({ steps: [step({ status: "running" })] })
    expect(runMessage(r)).toEqual({ text: "Cerco «contabile» su LinkedIn a Lugano…", live: true })
  })

  it("reports the last result during the pause, and what comes next", () => {
    const r = status({
      phase: "pausing",
      current: 0,
      steps: [step({ status: "done", found: 5, new: 3 }), step({ site: "indeed", place: "Ovunque" })],
    })
    expect(runMessage(r)?.text).toBe("Trovate su LinkedIn 5 offerte, di cui 3 nuove · tra poco Indeed ovunque…")
  })

  it("explains a failed board in words", () => {
    const r = status({
      phase: "pausing",
      steps: [step({ status: "error", error: "il portale non ha risposto in tempo" }), step({ site: "indeed" })],
    })
    expect(runMessage(r)?.text).toBe("LinkedIn: il portale non ha risposto in tempo · tra poco Indeed a Lugano…")
  })

  it("summarises the end", () => {
    const done = status({ running: false, phase: "done", current: null, found: 1, new: 1, steps: [step({ status: "done" })] })
    expect(runMessage(done)).toEqual({ text: "Ricerca completata: 1 nuova offerta", live: false })
    const withRecent = status({
      running: false, phase: "done", found: 6, new: 5,
      steps: [step({ status: "done", found: 6, new: 5 }), step({ status: "recent", ran_at: "x" })],
    })
    expect(runMessage(withRecent)?.text).toBe("Ricerca completata: 6 offerte, di cui 5 nuove · 1 già fatta di recente")
    const withHeld = status({
      running: false, phase: "done", found: 2, new: 2,
      steps: [step({ status: "done", found: 2, new: 2 }), step({ status: "skipped", error: "LinkedIn ha limitato le richieste" })],
    })
    expect(runMessage(withHeld)?.text).toBe("Ricerca completata: 2 nuove offerte · 1 rimandata")
    const allFailed = status({ running: false, phase: "done", steps: [step({ status: "error", error: "x" })] })
    expect(runMessage(allFailed)?.text).toBe("Nessun portale ha risposto: x")
    expect(runMessage(status({ phase: "idle" }))).toBeNull()
  })
})

describe("offersPhrase", () => {
  it("reads like a person would say it", () => {
    expect(offersPhrase(5, 5)).toBe("5 nuove offerte")
    expect(offersPhrase(1, 1)).toBe("1 nuova offerta")
    expect(offersPhrase(6, 5)).toBe("6 offerte, di cui 5 nuove")
    expect(offersPhrase(6, 1)).toBe("6 offerte, di cui 1 nuova")
    expect(offersPhrase(5, 0)).toBe("5 offerte, già viste")
    expect(offersPhrase(0, 0)).toBe("nessuna offerta")
  })
})

describe("stepOutcome", () => {
  it("adds what was thrown away and any caveat", () => {
    expect(stepOutcome(step({ status: "done", found: 2, new: 2 }))).toBe("2 nuove offerte")
    expect(stepOutcome(step({ status: "done", found: 2, new: 1, abroad: 1, off_title: 6 }))).toBe(
      "2 offerte, di cui 1 nuova · scartate 1 fuori dal paese, 6 con un altro titolo",
    )
    expect(stepOutcome(step({ status: "done", off_title: 3, note: "LinkedIn in pausa" }))).toBe(
      "nessuna offerta · scartate 3 con un altro titolo · LinkedIn in pausa",
    )
  })
})
