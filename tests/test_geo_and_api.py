from fastapi.testclient import TestClient

from career_agent import geo
from career_agent.app import app
from career_agent.query import Place

client = TestClient(app)


def test_search_falls_back_to_offline_catalogue():
    places, offline = geo.search("Stoccarda")
    assert offline
    assert places == [
        {
            "geo_id": None,
            "city": "Stoccarda",
            "region": None,
            "country": "de",
            "country_name": "Germania",
        }
    ]


def test_failed_english_lookup_is_not_retried(monkeypatch):
    calls = []
    monkeypatch.setattr(
        geo, "_get", lambda *a, **k: calls.append(a) or (_ for _ in ()).throw(OSError())
    )
    for _ in range(5):
        assert (
            Place(city="Napoli", country="it", geo_id=1).board().city == "Naples"
        )  # exonym fallback
    assert len(calls) == 1


def test_english_names_are_cached_only_from_the_english_search(monkeypatch):
    it = {
        "id": 7,
        "name": "Zurigo",
        "admin1": "Zurigo",
        "country": "Svizzera",
        "country_code": "CH",
        "feature_code": "PPLA",
    }
    monkeypatch.setattr(
        geo, "_get", lambda path, p: {"results": [it] if p["language"] == "it" else []}
    )
    geo._search_online.cache_clear()
    places, offline = geo.search("Zurigo")
    assert not offline and places[0]["geo_id"] == 7
    assert (
        7 not in geo._english
    )  # must be looked up by id later, never cached from Italian names


def test_places_endpoint_shape():
    assert (
        client.get("/api/places", params={"q": "zur"}).json()["places"][0]["city"]
        == "Zurigo"
    )


def test_saved_search_api_roundtrip():
    body = {
        "name": "Zurigo",
        "query": {
            "scopes": [{"places": [{"city": "Zurigo", "country": "ch"}]}],
            "title_any": ["go"],
        },
    }
    saved = client.post("/api/saved", json=body).json()
    assert saved["created"]
    assert client.post("/api/saved/999/run").status_code == 404
    assert client.delete(f"/api/saved/{saved['id']}").json() == {"ok": True}
    assert client.get("/api/saved").json() == []


def test_salary_over_limit_is_rejected():
    assert (
        client.post("/api/feed", json={"query": {"salary_min": 20_000_000}}).status_code
        == 422
    )


def test_a_salary_in_won_is_accepted():
    # 60 million won, in thousands: far above the francs or euros anyone earns.
    query = {"salary_min": 60_000, "salary_currency": "KRW"}
    assert client.post("/api/feed", json={"query": query}).status_code == 200


def test_search_starts_immediately_and_returns_a_summary(monkeypatch):
    from career_agent.app import runner

    monkeypatch.setattr(runner, "_run", lambda *a: None)  # never scrape in tests
    query = {"scopes": [{"anywhere": True, "modes": ["remote"]}], "title_any": ["go"]}
    r = client.post("/api/search", json=query)
    assert r.status_code == 200
    assert r.json() == {
        "queries": 1,
        "recent": 0,
        "held": 0,
        "held_reasons": [],
        "skipped": 1,
        "skip_reasons": ["Indeed cerca solo dentro un paese"],
        "eta_seconds": 7,
    }
    runner.state.running = False


def test_search_without_title_is_rejected_with_a_reason():
    r = client.post("/api/search", json={"scopes": [{"anywhere": True}]})
    assert r.status_code == 400 and "Titolo contiene" in r.json()["detail"]
