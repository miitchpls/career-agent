"""CV pages to PDF with a Chromium-family browser already on this computer.

career-ops prints its CVs with Playwright's Chromium; this does the same with the browser
the user has (Chrome, Chromium, Edge, Brave, or a Chromium Playwright downloaded), headless,
so the PDF matches the preview and needs no extra download. The page is printed from a file
in an empty temporary directory, with a throwaway browser profile and no network (the page
holds everything it needs: the photo is inlined), and the browser is given a time limit.
"""

import glob
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .i18n import t

TIMEOUT_S = 60

_NAMES = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
    "brave-browser",
    "chrome",
    "msedge",
)
_APPS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
)
# Chromium builds Playwright keeps in its cache, newest last.
_PLAYWRIGHT = (
    "~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome",
    "~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
)


def _build_number(path: str) -> int:
    m = re.search(r"chromium-(\d+)", path)
    return int(m[1]) if m else -1


class PdfError(Exception):
    """No PDF: the message is for the user."""


def find_browser() -> str | None:
    """The first Chromium-family browser found: on PATH, in the usual app folders, or in
    Playwright's cache."""
    for name in _NAMES:
        if found := shutil.which(name):
            return found
    for path in _APPS:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    for pattern in _PLAYWRIGHT:
        # By build number: as text, "chromium-999" would sort after "chromium-1105".
        builds = sorted(glob.glob(os.path.expanduser(pattern)), key=_build_number)
        if builds:
            return builds[-1]
    return None


def html_to_pdf(html: str, browser: str | None = None) -> bytes:
    """The page printed as the browser would print it, using the page's own @page size and
    margins. Raises PdfError."""
    browser = browser or find_browser()
    if not browser:
        raise PdfError(t("pdf_no_browser"))
    with tempfile.TemporaryDirectory(prefix="career-agent-pdf-") as tmp:
        page = Path(tmp, "cv.html")
        page.write_text(html, encoding="utf-8")
        out = Path(tmp, "cv.pdf")
        args = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--mute-audio",
            # No network: nothing on the page should load from elsewhere.
            "--proxy-server=127.0.0.1:9",
            "--proxy-bypass-list=<-loopback>",
            f"--user-data-dir={Path(tmp, 'profile')}",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            f"--print-to-pdf={out}",
            page.as_uri(),
        ]
        try:
            res = subprocess.run(
                args,
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_S,
                stdin=subprocess.DEVNULL,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            raise PdfError(t("pdf_failed", why=f"timeout {TIMEOUT_S}s")) from e
        except OSError as e:
            raise PdfError(t("pdf_failed", why=str(e))) from e
        data = out.read_bytes() if out.is_file() else b""
        if not data.startswith(b"%PDF-"):
            lines = [x for x in (res.stderr or "").splitlines() if x.strip()]
            why = lines[-1][:200] if lines else f"exit {res.returncode}"
            raise PdfError(t("pdf_failed", why=why))
        return data
