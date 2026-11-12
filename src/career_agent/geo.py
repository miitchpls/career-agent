"""Places: city autocomplete and the names the job boards understand.

Online: the Open-Meteo geocoding API (GeoNames data, no API key). Two lookups per
search, merged by GeoNames id: Italian names for the UI, English names for the boards
(LinkedIn geocodes "Zurigo" as all of Switzerland). Only the typed text leaves the machine.

Offline: a small catalogue, also the single source of the Italian exonyms used for
places that have no GeoNames id.
"""

import json
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

API = "https://geocoding-api.open-meteo.com/v1"
TIMEOUT = 4
RETRY_AFTER = 300  # seconds before retrying a failed English lookup

# ISO 3166-1 alpha-2 -> (Italian name, English name, JobSpy/Indeed country)
COUNTRIES: dict[str, tuple[str, str, str]] = {
    "it": ("Italia", "Italy", "italy"),
    "ch": ("Svizzera", "Switzerland", "switzerland"),
    "de": ("Germania", "Germany", "germany"),
    "fr": ("Francia", "France", "france"),
    "es": ("Spagna", "Spain", "spain"),
    "gb": ("Regno Unito", "United Kingdom", "uk"),
    "nl": ("Paesi Bassi", "Netherlands", "netherlands"),
    "at": ("Austria", "Austria", "austria"),
    "be": ("Belgio", "Belgium", "belgium"),
    "ie": ("Irlanda", "Ireland", "ireland"),
    "pt": ("Portogallo", "Portugal", "portugal"),
    "us": ("Stati Uniti", "United States", "usa"),
}

# (Italian name, English name, country)
OFFLINE_CITIES: list[tuple[str, str, str]] = [
    ("Milano", "Milan", "it"),
    ("Roma", "Rome", "it"),
    ("Torino", "Turin", "it"),
    ("Bologna", "Bologna", "it"),
    ("Firenze", "Florence", "it"),
    ("Napoli", "Naples", "it"),
    ("Genova", "Genoa", "it"),
    ("Padova", "Padua", "it"),
    ("Verona", "Verona", "it"),
    ("Venezia", "Venice", "it"),
    ("Bergamo", "Bergamo", "it"),
    ("Brescia", "Brescia", "it"),
    ("Bari", "Bari", "it"),
    ("Pisa", "Pisa", "it"),
    ("Trento", "Trento", "it"),
    ("Trieste", "Trieste", "it"),
    ("Parma", "Parma", "it"),
    ("Modena", "Modena", "it"),
    ("Catania", "Catania", "it"),
    ("Palermo", "Palermo", "it"),
    ("Zurigo", "Zurich", "ch"),
    ("Ginevra", "Geneva", "ch"),
    ("Basilea", "Basel", "ch"),
    ("Berna", "Bern", "ch"),
    ("Losanna", "Lausanne", "ch"),
    ("Lugano", "Lugano", "ch"),
    ("Zugo", "Zug", "ch"),
    ("Lucerna", "Lucerne", "ch"),
    ("Monaco di Baviera", "Munich", "de"),
    ("Berlino", "Berlin", "de"),
    ("Francoforte", "Frankfurt", "de"),
    ("Amburgo", "Hamburg", "de"),
    ("Colonia", "Cologne", "de"),
    ("Stoccarda", "Stuttgart", "de"),
    ("Parigi", "Paris", "fr"),
    ("Lione", "Lyon", "fr"),
    ("Nizza", "Nice", "fr"),
    ("Londra", "London", "gb"),
    ("Edimburgo", "Edinburgh", "gb"),
    ("Manchester", "Manchester", "gb"),
    ("Amsterdam", "Amsterdam", "nl"),
    ("Rotterdam", "Rotterdam", "nl"),
    ("L'Aia", "The Hague", "nl"),
    ("Vienna", "Vienna", "at"),
    ("Bruxelles", "Brussels", "be"),
    ("Dublino", "Dublin", "ie"),
    ("Lisbona", "Lisbon", "pt"),
    ("Porto", "Porto", "pt"),
    ("Madrid", "Madrid", "es"),
    ("Barcellona", "Barcelona", "es"),
    ("Valencia", "Valencia", "es"),
    ("Siviglia", "Seville", "es"),
    ("New York", "New York", "us"),
    ("San Francisco", "San Francisco", "us"),
]

EXONYMS: dict[str, str] = {it.lower(): en for it, en, _ in OFFLINE_CITIES}

_pool = ThreadPoolExecutor(max_workers=4)
_lock = threading.Lock()
_english: dict[int, dict] = {}  # geo_id -> {"city", "region", "country"} in English
_failed: dict[int, float] = {}  # geo_id -> time of the last failed lookup


def _norm(s: str) -> str:
    return "".join(
        c
        for c in unicodedata.normalize("NFD", s.lower().strip())
        if not unicodedata.combining(c)
    )


def _get(path: str, params: dict) -> dict:
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url, headers={"User-Agent": "career-agent/0.1 (local POC)"}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def _populated(r: dict) -> bool:
    """Cities, towns, villages (GeoNames feature codes PPL*), not regions or landmarks."""
    return str(r.get("feature_code", "")).startswith("PPL")


@lru_cache(maxsize=512)
def _search_online(text: str, limit: int) -> tuple[dict, ...]:
    """Raises on network errors, so failures are never cached."""
    params = {"name": text, "count": 20, "format": "json"}
    it_f = _pool.submit(_get, "search", {**params, "language": "it"})
    en_f = _pool.submit(_get, "search", {**params, "language": "en"})
    it_rows = [r for r in it_f.result().get("results", []) if _populated(r)]
    en_rows = {r["id"]: r for r in en_f.result().get("results", [])}

    out = []
    for r in it_rows[:limit]:
        # The English search may rank differently; only cache names it actually returned,
        # otherwise english() fetches them by id later.
        if en := en_rows.get(r["id"]):
            with _lock:
                _english[r["id"]] = {
                    "city": en.get("name"),
                    "region": en.get("admin1"),
                    "country": en.get("country"),
                }
        out.append(
            {
                "geo_id": r["id"],
                "city": r.get("name"),
                "region": r.get("admin1"),
                "country": str(r.get("country_code", "")).lower(),
                "country_name": r.get("country"),
            }
        )
    return tuple(out)


def _search_offline(text: str, limit: int) -> list[dict]:
    t = _norm(text)
    scored = []
    for it, en, cc in OFFLINE_CITIES:
        names = (_norm(it), _norm(en))
        score = (
            0
            if t in names
            else 1
            if any(n.startswith(t) for n in names)
            else 2
            if any(t in n for n in names)
            else -1
        )
        if score >= 0:
            scored.append(
                (
                    score,
                    {
                        "geo_id": None,
                        "city": it,
                        "region": None,
                        "country": cc,
                        "country_name": COUNTRIES[cc][0],
                    },
                )
            )
    return [p for _, p in sorted(scored, key=lambda x: x[0])[:limit]]


def search(text: str, limit: int = 8) -> tuple[list[dict], bool]:
    """Places matching `text` and whether they come from the offline catalogue."""
    text = text.strip()[:80]
    if len(text) < 2:
        return [], False
    try:
        return list(_search_online(text, limit)), False
    except (
        OSError,
        ValueError,
    ):  # network/timeout (URLError is an OSError) or a bad payload
        return _search_offline(text, limit), True


def english(geo_id: int) -> dict | None:
    """English names for a place: cached, and a failure isn't retried for RETRY_AFTER seconds."""
    with _lock:
        if geo_id in _english:
            return _english[geo_id]
        if time.monotonic() - _failed.get(geo_id, -RETRY_AFTER) < RETRY_AFTER:
            return None
    try:
        r = _get("get", {"id": geo_id, "language": "en"})
    except (OSError, ValueError):
        with _lock:
            _failed[geo_id] = time.monotonic()
        return None
    names = {
        "city": r.get("name"),
        "region": r.get("admin1"),
        "country": r.get("country"),
    }
    with _lock:
        _english[geo_id] = names
    return names
