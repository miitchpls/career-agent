import threading

from fastapi.testclient import TestClient

from career_agent import geo, scraper
from career_agent.app import app
from career_agent.i18n import LOCALE, LOCALES, MESSAGES, parse_accept_language, t

client = TestClient(app)


def test_every_message_exists_in_every_language_with_the_same_placeholders():
    import string

    def fields(text):
        return {f for _, f, _, _ in string.Formatter().parse(text) if f}

    for key, by_locale in MESSAGES.items():
        assert set(by_locale) == set(LOCALES), key
        for lang, text in by_locale.items():
            assert fields(text) == fields(by_locale["en"]), (key, lang)


def test_accept_language_picks_the_first_supported_language():
    assert parse_accept_language("en-GB,en;q=0.9") == "en"
    assert parse_accept_language("fr-FR, de;q=0.8") == "fr"
    assert parse_accept_language("ko-KR,ko;q=0.9") == "ko"
    assert parse_accept_language("zh-TW") == "zh"
    assert parse_accept_language("pl") == "it"
    assert parse_accept_language(None) == "it"


def test_api_errors_follow_the_request_language():
    for lang, text in [
        ("it", "Ricerca salvata non trovata"),
        ("en", "Saved search not found"),
        ("de", "Gespeicherte Suche nicht gefunden"),
        ("ko", "저장된 검색을 찾을 수 없습니다"),
    ]:
        r = client.post("/api/saved/999/run", headers={"Accept-Language": lang})
        assert r.status_code == 404 and r.json()["detail"] == text


def test_planning_errors_follow_the_request_language():
    r = client.post("/api/search", json={}, headers={"Accept-Language": "en"})
    assert r.status_code == 400
    assert "Add at least one “Where” filter" in r.json()["detail"]


def test_place_names_follow_the_request_language():
    def first(lang):
        r = client.get(
            "/api/places", params={"q": "stoccarda"}, headers={"Accept-Language": lang}
        )
        return r.json()["places"][0]

    assert first("it")["country_name"] == "Germania"
    assert first("en") | {"geo_id": None} == {
        "geo_id": None,
        "city": "Stuttgart",
        "region": None,
        "country": "de",
        "country_name": "Germany",
    }
    assert first("de")["country_name"] == "Deutschland"
    assert first("ko") | {"geo_id": None} == {
        "geo_id": None,
        "city": "Stuttgart",
        "region": None,
        "country": "de",
        "country_name": "독일",
    }
    assert geo.search("Stoccarda")[0][0]["city"] == "Stoccarda"  # default: Italian


def test_a_run_keeps_the_language_it_started_in(monkeypatch):
    seen = []
    done = threading.Event()

    def run(self, todo, q, order):
        seen.append(t("busy"))
        done.set()

    monkeypatch.setattr(scraper.Runner, "_run", run)
    token = LOCALE.set("de")
    try:
        from career_agent.query import Query

        q = Query.model_validate(
            {
                "scopes": [{"places": [{"city": "Zurigo", "country": "ch"}]}],
                "title_any": ["go"],
                "sites": ["linkedin"],
            }
        )
        scraper.Runner().start(q)
    finally:
        LOCALE.reset(token)
    assert done.wait(2)
    assert seen == ["Es läuft bereits eine Suche"]
