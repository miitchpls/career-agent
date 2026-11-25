import { describe, expect, it } from "vitest"

import { DEFAULT_CV_PREFS, jobCountry, postingLanguage, resolveCv } from "@/lib/cv-prefs"

describe("cv preferences", () => {
  it("reads the country at the end of a board location", () => {
    expect(jobCountry("Zurich, Zurich, Switzerland")).toBe("ch")
    expect(jobCountry("Zürich, ZH, CH")).toBe("ch")
    expect(jobCountry("New York, NY, United States")).toBe("us")
    expect(jobCountry("Toronto, ON, Canada")).toBe("ca")
    expect(jobCountry("Seoul, South Korea")).toBe("kr")
    expect(jobCountry("서울특별시, 대한민국")).toBe("kr")
    expect(jobCountry("Remote")).toBeNull()
    expect(jobCountry(null)).toBeNull()
  })

  it("guesses the posting's language from its common words", () => {
    expect(postingLanguage("Wir suchen eine Person mit Erfahrung und Freude an der Arbeit für das Team")).toBe("de")
    expect(postingLanguage("Cerchiamo una persona con esperienza per il team della piattaforma")).toBe("it")
    expect(postingLanguage("You will join the team and work with our engineers")).toBe("en")
    expect(postingLanguage("백엔드 개발자를 모집합니다. Python 및 FastAPI 경험이 있는 분을 찾습니다.")).toBe("ko")
    // An English posting with a Korean company name stays English.
    expect(postingLanguage("You will join 네이버 and work with our engineers on the team")).toBe("en")
    expect(postingLanguage(null)).toBe("en")
  })

  it("resolves auto: Letter and no photo in the US, A4 and photo in Switzerland", () => {
    const us = { location: "Austin, TX, United States", description: "You will build the platform with our team" }
    const ch = { location: "Zurich, Switzerland", description: "Wir suchen dich für unser Team und die Plattform" }
    expect(resolveCv(DEFAULT_CV_PREFS, us, true)).toEqual({
      language: "en",
      format: "letter",
      style: "standard",
      photo: false,
      footer: "",
    })
    expect(resolveCv(DEFAULT_CV_PREFS, ch, true)).toEqual({
      language: "de",
      format: "a4",
      style: "standard",
      photo: true,
      footer: "",
    })
    expect(resolveCv(DEFAULT_CV_PREFS, ch, false).photo).toBe(false) // nothing to show
  })

  it("explicit choices win over the posting", () => {
    const us = { location: "Austin, TX, United States", description: "You will build the platform" }
    const prefs = { ...DEFAULT_CV_PREFS, language: "it", format: "a4", style: "executive", photo: "always" } as const
    expect(resolveCv(prefs, us, true)).toEqual({
      language: "it",
      format: "a4",
      style: "executive",
      photo: true,
      footer: "",
    })
    expect(resolveCv({ ...prefs, photo: "never" }, us, true).photo).toBe(false)
  })

  it("ends with the footer everywhere, or only in the countries picked", () => {
    const milan = { location: "Milano, Lombardia, Italia", description: "You will join the team" }
    const zurich = { location: "Zurich, Switzerland", description: "You will join the team" }
    const remote = { location: "Remote", description: "Cerchiamo una persona con esperienza" }
    const consent = { ...DEFAULT_CV_PREFS, footer: " Autorizzo il trattamento dei dati. ", footerCountries: ["it"] }
    expect(resolveCv(consent, milan, false).footer).toBe("Autorizzo il trattamento dei dati.")
    expect(resolveCv(consent, zurich, false).footer).toBe("")
    expect(resolveCv(consent, remote, false).footer).toBe("") // no country: not one of them
    expect(resolveCv({ ...consent, footerCountries: [] }, zurich, false).footer).toBe("Autorizzo il trattamento dei dati.")
    expect(resolveCv(DEFAULT_CV_PREFS, milan, false).footer).toBe("") // none written
  })
})

describe("posting language, in every language a CV can be written in", () => {
  it("reads the script, then the common words", () => {
    expect(postingLanguage("バックエンドエンジニアを募集しています。Python の経験がある方")).toBe("ja")
    expect(postingLanguage("我们正在招聘后端工程师，需要 Python 经验")).toBe("zh")
    expect(postingLanguage("Мы ищем backend-разработчика с опытом работы на Python")).toBe("ru")
    expect(postingLanguage("Buscamos una persona con experiencia para el equipo de producto")).toBe("es")
    expect(postingLanguage("Nous cherchons une personne avec de l'expérience pour les équipes")).toBe("fr")
    expect(postingLanguage("Procuramos uma pessoa com experiência para a equipe dos produtos")).toBe("pt")
    expect(postingLanguage("Wij zoeken een collega met ervaring voor het team van de afdeling")).toBe("nl")
    expect(postingLanguage("Ekibimiz için deneyimli bir yazılım geliştirici arıyoruz ve bu iş")).toBe("tr")
    expect(postingLanguage("Kami mencari kandidat dengan pengalaman untuk tim yang dinamis dan")).toBe("id")
  })
})
