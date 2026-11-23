"""CV templates from career-ops, filled with the profile.

A Python port of the HTML half of career-ops' `build-cv-html.mjs`: the same placeholder
tokens, section partials with conditional blocks, contact row rebuilt from the fields
present, and optional sections dropped when empty. The templates themselves are copied
unchanged into `cv_templates/` (see its README), so a template that renders in career-ops
renders the same here.
"""

import html
import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Literal

from .profile import MonthYear, Profile

ROOT = Path(__file__).parent / "cv_templates"

TemplateId = Literal[
    "standard", "modern", "compact", "executive", "leadership", "jake", "ats"
]
TEMPLATES: dict[str, Path] = {
    "standard": ROOT / "cv-template.html",
    "modern": ROOT / "cv-template.modern.html",
    "compact": ROOT / "cv-template.compact.html",
    "executive": ROOT / "cv-template.executive.html",
    "leadership": ROOT / "cv-template.leadership.html",
    "jake": ROOT / "cv-template.jake.html",
    "ats": ROOT / "ats" / "cv-template.ats.html",
}
CvLanguage = Literal["it", "en", "de"]
PageFormat = Literal["a4", "letter"]
PAGE_WIDTHS = {"a4": "210mm", "letter": "8.5in"}
PAGE_HEIGHTS = {"a4": "297mm", "letter": "11in"}
PAGE_CSS = {"a4": "A4", "letter": "Letter"}

# Section titles and the few words the CV itself prints, in the CV's language.
WORDS: dict[str, dict[str, str]] = {
    "en": {
        "summary": "Professional Summary",
        "competencies": "Core Competencies",
        "experience": "Work Experience",
        "projects": "Projects",
        "education": "Education",
        "certifications": "Certifications",
        "awards": "Awards & Honors",
        "interests": "Interests",
        "skills": "Skills",
        "technical": "Technical",
        "languages": "Languages",
        "present": "Present",
    },
    "it": {
        "summary": "Profilo",
        "competencies": "Competenze chiave",
        "experience": "Esperienza professionale",
        "projects": "Progetti",
        "education": "Formazione",
        "certifications": "Certificazioni",
        "awards": "Premi e riconoscimenti",
        "interests": "Interessi",
        "skills": "Competenze",
        "technical": "Tecniche",
        "languages": "Lingue",
        "present": "oggi",
    },
    "de": {
        "summary": "Profil",
        "competencies": "Kernkompetenzen",
        "experience": "Berufserfahrung",
        "projects": "Projekte",
        "education": "Ausbildung",
        "certifications": "Zertifizierungen",
        "awards": "Auszeichnungen",
        "interests": "Interessen",
        "skills": "Kenntnisse",
        "technical": "Fachlich",
        "languages": "Sprachen",
        "present": "heute",
    },
}
MONTHS = {
    "en": [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ],
    "it": [
        "gen",
        "feb",
        "mar",
        "apr",
        "mag",
        "giu",
        "lug",
        "ago",
        "set",
        "ott",
        "nov",
        "dic",
    ],
    "de": [
        "Jan.",
        "Feb.",
        "März",
        "Apr.",
        "Mai",
        "Juni",
        "Juli",
        "Aug.",
        "Sep.",
        "Okt.",
        "Nov.",
        "Dez.",
    ],
}
LEVELS = {
    "en": {"elementary": "elementary", "limited": "limited working", "professional": "professional working",
           "full": "full professional", "native": "native"},
    "it": {"elementary": "elementare", "limited": "professionale limitata", "professional": "professionale",
           "full": "professionale completa", "native": "madrelingua"},
    "de": {"elementary": "Grundkenntnisse", "limited": "eingeschränkt", "professional": "verhandlungssicher",
           "full": "fließend", "native": "Muttersprache"},
}  # fmt: skip


# --- Escaping and URLs (as build-cv-html.mjs) --------------------------------------------------


def esc(text: object) -> str:
    """Text for HTML; braces too, so profile text can never read as a placeholder."""
    if text is None:
        return ""
    return (
        html.escape(str(text), quote=True).replace("{", "&#123;").replace("}", "&#125;")
    )


_SCHEMES = ("mailto:", "tel:", "http:", "https:")


def safe_url(url: str | None) -> str:
    """Only the schemes a CV links to; bare domains get https://, other schemes are dropped."""
    url = (url or "").strip()
    if not url:
        return ""
    if not url.lower().startswith(_SCHEMES):
        if re.match(r"^[a-z][a-z0-9+.-]*:", url, re.IGNORECASE):
            return ""
        url = ("mailto:" if "@" in url and "/" not in url else "https://") + url
    return esc(url)


# The app's own uploads, or an image inlined as a data URL (for a PDF without a server).
_PHOTO_SRC = re.compile(
    r"^(/api/profile/files/[0-9a-f]{32}|data:image/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+)$",
    re.IGNORECASE,
)


# --- Template parsing -------------------------------------------------------------------------

_TOKEN = re.compile(r"\{\{([A-Z_]+)\}\}")


def fill(source: str, fields: dict[str, str]) -> str:
    """Replace the {{TOKENS}} that `fields` knows; others stay for a later pass."""
    return _TOKEN.sub(lambda m: fields.get(m[1], m[0]), source)


@dataclass
class Partial:
    entry: str
    blocks: dict[str, tuple[str, str]]  # name -> (present markup, absent markup)


_BLOCK = re.compile(r"<!--([A-Z][A-Z0-9_]+)-->([\s\S]*?)<!--/\1-->")


def parse_partial(source: str) -> Partial:
    zone = re.search(r"<!--ENTRY-->([\s\S]*?)<!--/ENTRY-->", source)
    if not zone:
        raise ValueError("partial without an <!--ENTRY--> zone")
    body = zone[1]
    found = {m[1]: (m[0], m[2]) for m in _BLOCK.finditer(body) if m[1] != "ENTRY"}
    blocks: dict[str, tuple[str, str]] = {}
    for name, (_, content) in found.items():
        if not name.endswith("_EMPTY"):
            blocks[name] = (content, blocks.get(name, ("", ""))[1])
    for name, (_, content) in found.items():
        if name.endswith("_EMPTY"):
            stem = name.removesuffix("_EMPTY")
            base = f"{stem}_BLOCK" if f"{stem}_BLOCK" in found else stem
            blocks[base] = (blocks.get(base, ("", ""))[0], content)
    for definition, _ in found.values():
        body = body.replace(definition, "")
    return Partial(body.strip(), blocks)


def fill_entry(
    p: Partial, fields: dict[str, str], present: dict[str, str | None]
) -> str:
    """One entry: each conditional block in its present or absent form, then the fields."""
    out = p.entry
    for name, value in present.items():
        if name not in p.blocks:
            continue
        on, off = p.blocks[name]
        scalar = name.removesuffix("_BLOCK")
        markup = fill(on, {name: value, scalar: value}) if value else off
        out = out.replace("{{" + name + "}}", markup)
    return fill(out, fields)


@cache
def _partials(template: Path) -> dict[str, Partial]:
    out = {}
    for f in (template.parent / "sections").glob("*.html"):
        out[f.stem] = parse_partial(f.read_text())
    return out


@cache
def _source(template: Path) -> str:
    return template.read_text()


# --- Empty sections (as cv-sections-core.mjs) -------------------------------------------------

_BOUNDARY = r"(?=<!--\s+[A-Z][A-Z ]*-->|$)"
_SECTION_ONLY = r"(?=<!--\s+(?!END\s*-->)[A-Z][A-Z ]*-->)"
_END = r"(?=<!--\s+[A-Z][A-Z ]*-->)"
_SECTIONS = {
    "summary": rf"<!--\s+PROFESSIONAL SUMMARY\s+-->[\s\S]*?{_SECTION_ONLY}",
    "competencies": rf"<!--\s+CORE COMPETENCIES\s+-->[\s\S]*?{_BOUNDARY}",
    "experience": rf"<!--\s+WORK EXPERIENCE\s+-->[\s\S]*?{_BOUNDARY}",
    "projects": rf"<!--\s+PROJECTS\s+-->[\s\S]*?{_BOUNDARY}",
    "education": rf"<!--\s+EDUCATION\s+-->[\s\S]*?{_BOUNDARY}",
    "certifications": rf"<!--\s+CERTIFICATIONS\s+-->[\s\S]*?{_BOUNDARY}",
    "awards": rf"<!--\s+AWARDS\s+-->[\s\S]*?{_BOUNDARY}",
    "interests": rf"<!--\s+INTERESTS\s+-->[\s\S]*?{_BOUNDARY}",
    "skills": rf"<!--\s+SKILLS\s+-->[\s\S]*?{_END}",
}


def strip_empty(source: str, filled: dict[str, bool]) -> str:
    for section, pattern in _SECTIONS.items():
        if not filled.get(section):
            source = re.sub(pattern, "", source, count=1)
    return source


# --- From the profile -------------------------------------------------------------------------


def _date(d: MonthYear | None, lang: str) -> str:
    if not d:
        return ""
    return f"{MONTHS[lang][d.month]} {d.year}" if d.month is not None else str(d.year)


def _period(start, end, current: bool, lang: str) -> str:
    a = _date(start, lang)
    b = WORDS[lang]["present"] if current else _date(end, lang)
    return f"{a} – {b}" if a and b and a != b else a or b


def _years(start, end) -> str:
    a, b = (start.year if start else None), (end.year if end else None)
    return f"{a} – {b}" if a and b and a != b else str(a or b or "")


def _replace_contact_row(source: str, row: str) -> str:
    """Swap the template's .contact-row for `row`, finding its closing tag by nesting depth."""
    start = source.find('<div class="contact-row">')
    if start < 0:
        return source
    depth, i = 0, start
    for tag in re.finditer(r"<(/?)div\b", source[start:]):
        depth += -1 if tag[1] else 1
        if depth == 0:
            i = start + tag.end()
            end = source.index(">", i) + 1
            return source[:start] + row + source[end:]
    return source


def _contact_row(p: Profile) -> str:
    items = []
    if p.email:
        items.append(f'<a href="{safe_url("mailto:" + p.email)}">{esc(p.email)}</a>')
    for link in p.links:
        href = safe_url(link.url)
        if href:
            # The address itself, as career-ops prints it: no scheme, no www, no trailing slash.
            shown = re.sub(
                r"^(https?://(www\.)?|mailto:|tel:)",
                "",
                link.url.strip(),
                flags=re.IGNORECASE,
            )
            items.append(f'<a href="{href}">{esc(shown.rstrip("/"))}</a>')
    if p.location:
        items.append(f"<span>{esc(p.location)}</span>")
    return '<div class="contact-row">\n      ' + "\n      ".join(items) + "\n    </div>"


def _experience(p: Profile, part: Partial, lang: str, mark) -> str:
    out = []
    for e in p.experiences:
        if not (e.role or e.company):
            continue
        where = " · ".join(
            x
            for x in (e.location, e.location_type and _MODES[lang][e.location_type])
            if x
        )
        bullets = "\n    ".join(f"<li>{mark(b)}</li>" for b in e.bullets if b)
        fields = {
            "COMPANY": esc(e.company),
            "PERIOD": esc(_period(e.start, e.end, e.current, lang)),
            "ROLE": esc(e.role),
            "LOCATION": esc(where),
            "CONTEXT": "",
            "BULLETS": bullets,
        }
        out.append(
            fill_entry(
                part, fields, {"LOCATION_BLOCK": esc(where), "CONTEXT_BLOCK": None}
            )
        )
    return "\n  ".join(out)


_MODES = {
    "en": {"onsite": "On-site", "hybrid": "Hybrid", "remote": "Remote"},
    "it": {"onsite": "In sede", "hybrid": "Ibrido", "remote": "Da remoto"},
    "de": {"onsite": "Vor Ort", "hybrid": "Hybrid", "remote": "Remote"},
}


def _education(p: Profile, part: Partial, lang: str) -> str:
    out = []
    for d in p.education:
        if not (d.school or d.degree or d.field):
            continue
        title = ", ".join(x for x in (d.degree, d.field) if x) or d.school
        org = d.school if title != d.school else ""
        desc = " · ".join(x for x in (d.grade, d.description) if x)
        fields = {
            "TITLE": esc(title),
            "ORG": esc(org),
            "LOCATION": "",
            "YEAR": esc(_years(d.start, d.end)),
            "DESC": esc(desc),
        }
        present = {
            "ORG_BLOCK": esc(org) or None,
            "LOCATION_BLOCK": None,
            "DESC_BLOCK": esc(desc) or None,
        }
        out.append(fill_entry(part, fields, present))
    return "\n  ".join(out)


def _projects(p: Profile, part: Partial) -> str:
    out = []
    for x in p.projects:
        if not x.name:
            continue
        href = safe_url(x.url)
        name = f'<a href="{href}">{esc(x.name)}</a>' if href else esc(x.name)
        tech = ", ".join(x.skills)
        fields = {
            "NAME": name,
            "BADGE": "",
            "DESC": esc(x.description),
            "TECH": esc(tech),
        }
        present = {
            "BADGE_BLOCK": None,
            "DESC_BLOCK": esc(x.description) or None,
            "TECH_BLOCK": esc(tech) or None,
        }
        out.append(fill_entry(part, fields, present))
    return "\n  ".join(out)


def _certifications(p: Profile, part: Partial) -> str:
    out = []
    for c in p.certifications:
        if not c.name:
            continue
        year = str(c.issued.year) if c.issued else ""
        fields = {"TITLE": esc(c.name), "ORG": esc(c.issuer), "YEAR": esc(year)}
        out.append(
            fill_entry(
                part,
                fields,
                {"ORG_BLOCK": esc(c.issuer) or None, "YEAR_BLOCK": esc(year) or None},
            )
        )
    return "\n    ".join(out)


def _skills(p: Profile, part: Partial, lang: str) -> str:
    w = WORDS[lang]
    rows = []
    names = [s.name for s in p.skills]
    if names:
        rows.append((w["technical"], ", ".join(names)))
    langs = [
        f"{x.name} ({x.level if x.level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') else LEVELS[lang][x.level]})"
        for x in p.languages
        if x.name
    ]
    if langs:
        rows.append((w["languages"], ", ".join(langs)))
    if not rows:
        return ""
    items = "\n".join(
        fill_entry(
            part,
            {"CATEGORY": esc(cat), "ITEMS_TEXT": esc(text)},
            {"CATEGORY_BLOCK": esc(cat)},
        )
        for cat, text in rows
    )
    return f'<div class="skills-grid">\n{items}\n  </div>'


def _page_css(page: PageFormat, marks: bool = False) -> str:
    """The sheet: @page for printing (as career-ops' generate-pdf.mjs adds it), and on screen a
    page-sized white sheet with the same margin, so a preview looks like the printout."""
    return (
        '<style id="career-agent-page">\n'
        f"@page {{ size: {PAGE_CSS[page]}; margin: var(--page-margin, 0.6in); }}\n"
        "@media screen {\n"
        "  html, body { margin: 0; }\n"
        f"  .page {{ box-sizing: border-box; width: {PAGE_WIDTHS[page]}; max-width: none;"
        f" min-height: {PAGE_HEIGHTS[page]}; padding: var(--page-margin, 0.6in); }}\n"
        "}\n"
        + (
            "mark.ca-changed { background: #fde68a; color: inherit; border-radius: 2px;"
            " padding: 0 1px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }\n"
            "@media print { mark.ca-changed { background: none; padding: 0; } }\n"
            if marks
            else ""
        )
        + "</style>"
    )


def render(
    template: TemplateId,
    profile: Profile,
    lang: CvLanguage = "en",
    page: PageFormat = "a4",
    photo: bool = False,
    marked: frozenset[str] = frozenset(),
) -> str:
    """The CV as an HTML document. Texts in `marked` (bullets, the summary) are highlighted:
    the parts a tailored CV changed."""

    def mark(text: str) -> str:
        return (
            f'<mark class="ca-changed">{esc(text)}</mark>'
            if text in marked
            else esc(text)
        )

    path = TEMPLATES[template]
    parts = _partials(path)
    w = WORDS[lang]
    p = profile
    photo_src = p.photo if photo and p.photo and _PHOTO_SRC.match(p.photo) else ""

    sections = {
        "EXPERIENCE": _experience(p, parts["experience"], lang, mark),
        "PROJECTS": _projects(p, parts["projects"]),
        "EDUCATION": _education(p, parts["education"], lang),
        "CERTIFICATIONS": _certifications(p, parts["certifications"]),
        "SKILLS": _skills(p, parts["skills"], lang),
    }
    fields = {
        "LANG": lang,
        "PAGE_WIDTH": PAGE_WIDTHS[page],
        "NAME": esc(p.name),
        "SUMMARY_TEXT": mark(p.summary),
        "COMPETENCIES": "",
        "AWARDS": "",
        "INTERESTS": "",
        "CONSENT": "",
        "PHOTO": f'<img class="cv-photo cv-photo--rounded" src="{esc(photo_src)}" alt="{esc(p.name)}">'
        if photo_src
        else "",
        **sections,
        **{f"SECTION_{k.upper()}": esc(w[k]) for k in _SECTIONS},
    }
    source = _source(path)
    out = _replace_contact_row(source, _contact_row(p))
    title = f'<div class="header-title">{esc(p.headline)}</div>' if p.headline else ""
    # On its own line the whole line goes when there's no headline; anywhere else, just the token.
    out = re.sub(
        r"\n([ \t]*)\{\{TITLE_BLOCK\}\}",
        lambda m: f"\n{m[1]}{title}" if title else "",
        out,
    ).replace("{{TITLE_BLOCK}}", title)
    out = strip_empty(
        out,
        {
            "summary": bool(p.summary.strip()),
            "experience": bool(sections["EXPERIENCE"]),
            "projects": bool(sections["PROJECTS"]),
            "education": bool(sections["EDUCATION"]),
            "certifications": bool(sections["CERTIFICATIONS"]),
            "skills": bool(sections["SKILLS"]),
        },
    )
    # The <head> only gets plain values: its CSS comments quote tokens like {{PHOTO}}, and
    # markup (or a name containing "*/") must never land inside a stylesheet.
    head, sep, body = out.partition("</head>")
    head = fill(head, {k: fields[k] for k in ("LANG", "NAME", "PAGE_WIDTH")})
    body = fill(body, fields)
    out = head + _page_css(page, bool(marked)) + "\n" + sep + body
    code = re.sub(r"/\*[\s\S]*?\*/|<!--[\s\S]*?-->", "", head) + body
    left = set(_TOKEN.findall(code))
    if left:  # a template this renderer doesn't know how to fill
        raise ValueError(f"{path.name}: unfilled placeholders {sorted(left)}")
    return out


def sample_profile() -> Profile:
    """Shown in the template gallery before the user has a profile of their own."""
    return Profile.model_validate(
        {
            "name": "Alex Moretti",
            "headline": "Senior Backend Engineer · Python, distributed systems",
            "location": "Milan, Italy",
            "email": "alex.moretti@example.com",
            "links": [
                {"id": "l1", "label": "LinkedIn", "url": "https://linkedin.com/in/alexmoretti"},
                {"id": "l2", "label": "GitHub", "url": "https://github.com/alexmoretti"},
            ],
            "summary": "Backend engineer with 6 years on high-traffic Python services. Led the move "
            "from a Django monolith to FastAPI services, cutting p95 latency by 40%.",
            "experiences": [
                {
                    "id": "e1",
                    "role": "Senior Backend Engineer",
                    "company": "Fintrail",
                    "location": "Milan",
                    "locationType": "hybrid",
                    "start": {"month": 2, "year": 2022},
                    "current": True,
                    "bullets": [
                        "Split a Django monolith into 9 FastAPI services: p95 from 820 to 490 ms.",
                        "Event pipeline on PostgreSQL and Redis Streams for 3M transactions a day.",
                        "Mentored 3 junior developers; reworked the code review process.",
                    ],
                    "skills": ["Python", "FastAPI", "PostgreSQL", "Redis"],
                },
                {
                    "id": "e2",
                    "role": "Backend Developer",
                    "company": "Borgo Digitale",
                    "location": "Turin",
                    "start": {"month": 8, "year": 2019},
                    "end": {"month": 1, "year": 2022},
                    "bullets": [
                        "REST APIs for a booking app with 200k monthly active users.",
                        "End-to-end tests and CI: releases from weekly to daily.",
                    ],
                    "skills": ["Django", "GitHub Actions"],
                },
            ],
            "education": [
                {
                    "id": "d1",
                    "school": "Politecnico di Torino",
                    "degree": "MSc",
                    "field": "Computer Engineering",
                    "start": {"year": 2017},
                    "end": {"year": 2019},
                    "grade": "110/110",
                }
            ],
            "skills": [
                {"name": n}
                for n in ("Python", "FastAPI", "Django", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS")
            ],
            "languages": [
                {"id": "g1", "name": "Italian", "level": "native"},
                {"id": "g2", "name": "English", "level": "C1"},
            ],
            "projects": [
                {
                    "id": "p1",
                    "name": "pgqueue",
                    "description": "Job queue on PostgreSQL with SKIP LOCKED, 1.2k stars on GitHub.",
                    "url": "https://github.com/alexmoretti/pgqueue",
                    "skills": ["Python", "PostgreSQL"],
                }
            ],
            "certifications": [
                {"id": "c1", "name": "AWS Certified Developer – Associate", "issuer": "Amazon Web Services",
                 "issued": {"month": 4, "year": 2024}}
            ],
        }
    )  # fmt: skip
