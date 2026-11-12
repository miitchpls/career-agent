"""Exchange rates for comparing salaries across currencies.

ECB euro reference rates (public, no key, updated once per working day), cached for
the day. If the feed is unreachable we fall back to a bundled snapshot: close enough
to compare "80K" across currencies, which is all this is used for.
"""

import re
import threading
import time
import urllib.request

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
TIMEOUT = 4
MAX_AGE = 12 * 3600  # seconds; the ECB publishes once a day
RETRY_AFTER = 600  # after a failed fetch, keep using what we have for 10 minutes

# 1 EUR = rate units of the currency (ECB, 2026-11-11).
FALLBACK_DATE = "2026-11-11"
FALLBACK: dict[str, float] = {
    "EUR": 1.0, "USD": 1.1127, "JPY": 177.18, "CZK": 24.378, "DKK": 7.4755, "GBP": 0.83618,
    "HUF": 365.08, "PLN": 4.4038, "RON": 5.3451, "SEK": 11.0510, "CHF": 0.9234, "ISK": 136.80,
    "NOK": 10.6145, "TRY": 55.8897, "AUD": 1.6222, "BRL": 6.1827, "CAD": 1.5839, "CNY": 7.4225,
    "HKD": 8.7298, "IDR": 20223.32, "ILS": 3.5290, "INR": 104.2540, "KRW": 1487.57, "MXN": 20.7623,
    "MYR": 4.5326, "NZD": 1.9928, "PHP": 70.379, "SGD": 1.4271, "THB": 37.487, "ZAR": 18.4307,
}  # fmt: skip

_lock = threading.Lock()
_cache: tuple[float, str, dict[str, float]] | None = None  # (fetched_at, date, rates)
_failed_at = float("-inf")  # monotonic time of the last failed fetch


def _fetch() -> tuple[str, dict[str, float]]:
    req = urllib.request.Request(
        ECB_URL, headers={"User-Agent": "career-agent/0.1 (local POC)"}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        xml = r.read().decode()
    day = re.search(r"time='([\d-]+)'", xml)
    rates = {
        c: float(v)
        for c, v in re.findall(r"currency='([A-Z]{3})' rate='([\d.]+)'", xml)
    }
    if not day or "USD" not in rates:
        raise ValueError("unexpected ECB payload")
    return day.group(1), {"EUR": 1.0, **rates}


def rates() -> tuple[str, dict[str, float]]:
    """(date, {currency: units per 1 EUR}). Never raises."""
    global _cache, _failed_at
    now = time.monotonic()
    with _lock:
        if _cache and now - _cache[0] < MAX_AGE:
            return _cache[1], _cache[2]
        if now - _failed_at < RETRY_AFTER:
            return (_cache[1], _cache[2]) if _cache else (FALLBACK_DATE, FALLBACK)
    try:
        day, fetched = _fetch()
    except (OSError, ValueError):
        with _lock:
            _failed_at = now
            return (_cache[1], _cache[2]) if _cache else (FALLBACK_DATE, FALLBACK)
    with _lock:
        _cache = (now, day, fetched)
    return day, fetched


def convert(
    amount: float | None, currency: str | None, to: str, table: dict[str, float]
) -> float | None:
    """`amount` in `currency` expressed in `to`; None if either currency is unknown."""
    if amount is None or not currency:
        return None
    src, dst = table.get(currency.upper()), table.get(to.upper())
    if not src or not dst:
        return None
    return amount / src * dst
