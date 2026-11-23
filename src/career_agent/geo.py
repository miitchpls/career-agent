"""Places: city autocomplete and the names the job boards understand.

Online: the Open-Meteo geocoding API (GeoNames data, no API key). Two lookups per
search, merged by GeoNames id: names in the UI's language for display, English names for
the boards (LinkedIn geocodes "Zurigo" as all of Switzerland). Only the typed text leaves
the machine.

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

from .i18n import Locale

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
    "kr": ("Corea del Sud", "South Korea", "south korea"),
}

# Country names for the offline catalogue in a German or Korean UI (it has no city names in
# those languages: cities come out in English, which the boards understand anyway).
COUNTRIES_KO: dict[str, str] = {
    "it": "이탈리아",
    "ch": "스위스",
    "de": "독일",
    "fr": "프랑스",
    "es": "스페인",
    "gb": "영국",
    "nl": "네덜란드",
    "at": "오스트리아",
    "be": "벨기에",
    "ie": "아일랜드",
    "pt": "포르투갈",
    "us": "미국",
    "kr": "대한민국",
}
COUNTRIES_DE: dict[str, str] = {
    "it": "Italien",
    "ch": "Schweiz",
    "de": "Deutschland",
    "fr": "Frankreich",
    "es": "Spanien",
    "gb": "Vereinigtes Königreich",
    "nl": "Niederlande",
    "at": "Österreich",
    "be": "Belgien",
    "ie": "Irland",
    "pt": "Portugal",
    "us": "Vereinigte Staaten",
    "kr": "Südkorea",
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
    ("Seul", "Seoul", "kr"),
    ("Busan", "Busan", "kr"),
    ("Incheon", "Incheon", "kr"),
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
def _search_online(text: str, limit: int, lang: Locale = "it") -> tuple[dict, ...]:
    """Places named in `lang`; raises on network errors, so failures are never cached."""
    params = {"name": text, "count": 20, "format": "json"}
    shown_f = _pool.submit(_get, "search", {**params, "language": lang})
    # English names are what the boards get: fetch them alongside (once, for an English UI).
    en_f = (
        shown_f
        if lang == "en"
        else _pool.submit(_get, "search", {**params, "language": "en"})
    )
    rows = [r for r in shown_f.result().get("results", []) if _populated(r)]
    en_rows = {r["id"]: r for r in en_f.result().get("results", [])}

    out = []
    for r in rows[:limit]:
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


def _country_name(cc: str, lang: Locale) -> str:
    if lang == "de":
        return COUNTRIES_DE[cc]
    if lang == "ko":
        return COUNTRIES_KO[cc]
    return COUNTRIES[cc][0 if lang == "it" else 1]


def _search_offline(text: str, limit: int, lang: Locale = "it") -> list[dict]:
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
                        "city": it if lang == "it" else en,
                        "region": None,
                        "country": cc,
                        "country_name": _country_name(cc, lang),
                    },
                )
            )
    return [p for _, p in sorted(scored, key=lambda x: x[0])[:limit]]


def search(text: str, limit: int = 8, lang: Locale = "it") -> tuple[list[dict], bool]:
    """Places matching `text`, named in `lang`, and whether they come from the offline catalogue."""
    text = text.strip()[:80]
    if len(text) < 2:
        return [], False
    try:
        return list(_search_online(text, limit, lang)), False
    except (
        OSError,
        ValueError,
    ):  # network/timeout (URLError is an OSError) or a bad payload
        return _search_offline(text, limit, lang), True


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
