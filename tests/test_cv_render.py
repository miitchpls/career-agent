import re

import pytest
from fastapi.testclient import TestClient

from career_agent import cv_render
from career_agent.app import app
from career_agent.profile import Profile

client = TestClient(app)


@pytest.mark.parametrize("template", list(cv_render.TEMPLATES))
@pytest.mark.parametrize("lang", ["it", "en", "de", "ko"])
def test_every_template_renders_the_profile(template, lang):
    out = cv_render.render(
        template, cv_render.sample_profile(), lang, "a4", photo=False
    )
    assert "Alex Moretti" in out and "Fintrail" in out and "pgqueue" in out
    assert cv_render.WORDS[lang]["experience"] in out
    code = re.sub(
        r"/\*[\s\S]*?\*/|<!--[\s\S]*?-->", "", out
    )  # comments may quote tokens
    assert not re.search(r"\{\{[A-Z_]+\}\}", code)  # nothing left unfilled
    assert f'lang="{lang}"' in out


def test_empty_sections_are_dropped():
    p = Profile(name="Solo Nome", experiences=[])
    out = cv_render.render("standard", p, "en")
    for title in (
        "Work Experience",
        "Projects",
        "Education",
        "Certifications",
        "Skills",
        "Professional Summary",
    ):
        assert f">{title}<" not in out


def test_profile_text_is_escaped_and_links_are_safe():
    p = Profile.model_validate(
        {
            "name": "<script>alert(1)</script> {{NAME}}",
            "links": [
                {"id": "a", "label": "x", "url": "javascript:alert(1)"},
                {"id": "b", "label": "y", "url": "github.com/me"},
            ],
            "experiences": [{"id": "e", "role": "R&D <b>", "company": "ACME"}],
        }
    )
    out = cv_render.render("modern", p, "en")
    assert "<script>alert" not in out and "&lt;script&gt;" in out
    assert "javascript:" not in out
    assert 'href="https://github.com/me"' in out
    assert "R&amp;D &lt;b&gt;" in out
    assert "&#123;&#123;NAME&#125;&#125;" in out


def test_page_format_and_photo():
    p = cv_render.sample_profile().model_copy(
        update={"photo": "/api/profile/files/" + "a" * 32}
    )
    letter = cv_render.render("standard", p, "en", "letter", photo=True)
    assert "size: Letter" in letter and "8.5in" in letter
    assert 'class="cv-photo' in letter
    assert 'class="cv-photo' not in cv_render.render(
        "standard", p, "en", "a4", photo=False
    )
    elsewhere = p.model_copy(update={"photo": "https://tracker.example/pixel.png"})
    assert "tracker.example" not in cv_render.render(
        "standard", elsewhere, "en", photo=True
    )


def test_preview_renders_several_styles_in_one_request():
    r = client.post(
        "/api/cv/preview", json={"templates": ["jake", "ats"], "language": "de"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sample"] is True and set(body["pages"]) == {"jake", "ats"}
    assert "Berufserfahrung" in body["pages"]["jake"]
    assert client.post("/api/cv/preview", json={"templates": []}).status_code == 422
    assert (
        client.post("/api/cv/preview", json={"templates": ["fancy"]}).status_code == 422
    )


def test_preview_never_swaps_a_profile_for_the_sample():
    nearly_empty = {"summary": "Just a summary.", "skills": [{"name": "Go"}]}
    r = client.post(
        "/api/cv/preview", json={"templates": ["standard"], "profile": nearly_empty}
    )
    page = r.json()["pages"]["standard"]
    assert r.json()["sample"] is False
    assert "Just a summary." in page and "Alex Moretti" not in page


def test_preview_highlights_and_reports_render_failures(monkeypatch):
    mine = {"name": "Giulia", "summary": "Data engineer.", "experiences": []}
    r = client.post(
        "/api/cv/preview",
        json={"templates": ["modern"], "profile": mine, "marked": ["Data engineer."]},
    )
    assert (
        '<mark class="ca-changed">Data engineer.</mark>' in r.json()["pages"]["modern"]
    )

    def broken(*_a, **_k):
        raise ValueError("unfilled")

    monkeypatch.setattr(cv_render, "render", broken)
    r = client.post(
        "/api/cv/preview",
        json={"templates": ["modern"]},
        headers={"Accept-Language": "en"},
    )
    assert r.status_code == 500 and "pick another" in r.json()["detail"]


def test_old_style_names_are_migrated():
    from career_agent import db

    db.set_setting("cv_prefs", '{"style": "classic", "format": "letter"}')
    prefs = client.get("/api/cv/preferences").json()
    assert prefs["style"] == "executive" and prefs["format"] == "letter"


def test_nothing_from_the_profile_lands_in_the_stylesheet():
    p = cv_render.sample_profile().model_copy(
        update={
            "name": "*/ .page{display:none} /*",
            "photo": "/api/profile/files/" + "b" * 32,
        }
    )
    out = cv_render.render("standard", p, "en", photo=True)
    head = out.split("</head>")[0]
    style = "".join(re.findall(r"<style[\s\S]*?</style>", head))
    assert ".page{display:none}" not in style
    assert ".page&#123;" not in style
    assert "<img class=" not in style  # the template's own comments mention <img>
    assert 'class="cv-photo' in out.split("</head>")[1]


def test_blank_education_entries_are_skipped():
    p = Profile.model_validate({"name": "A", "education": [{"id": "d"}]})
    assert ">Education<" not in cv_render.render("standard", p, "en")


def test_contact_links_print_their_address():
    p = Profile.model_validate(
        {
            "name": "A",
            "links": [
                {"id": "a", "label": "Phone", "url": "tel:+39 333 1234567"},
                {"id": "b", "label": "Site", "url": "https://www.example.com/"},
            ],
        }
    )
    out = cv_render.render("standard", p, "en")
    assert ">+39 333 1234567</a>" in out and ">example.com</a>" in out
    assert ">tel:" not in out


def test_contact_row_with_nested_markup_and_inline_title():
    src = (
        '<html><head><title>{{NAME}}</title></head><body><div class="page">'
        '<h1>{{NAME}}</h1>{{TITLE_BLOCK}}<div class="contact-row"><div><a>{{EMAIL}}</a></div></div>'
        "<p>after</p></div></body></html>"
    )
    out = cv_render._replace_contact_row(src, '<div class="contact-row">X</div>')
    assert (
        out.count("contact-row") == 1
        and "<p>after</p>" in out
        and "{{EMAIL}}" not in out
    )


def test_marked_texts_are_highlighted():
    p = cv_render.sample_profile()
    bullet = p.experiences[0].bullets[1]
    out = cv_render.render("modern", p, "en", marked=frozenset({bullet, p.summary}))
    assert out.count('<mark class="ca-changed">') == 2
    assert "mark.ca-changed" in out
    assert "ca-changed" not in cv_render.render("modern", p, "en")


def test_company_key_matches_the_ui():
    assert cv_render.company_key("Acme S.p.A.") == cv_render.company_key("ACME")
    assert cv_render.company_key("Société Générale SA") == "societe generale"
    assert cv_render.company_key("Glutz AG") == "glutz"
    assert cv_render.company_key("J.P. Morgan") == "jp morgan"
    assert cv_render.company_key("Inc") == "inc"
    assert cv_render.company_key("Acme") != cv_render.company_key("Acme Labs")


def _roles_profile() -> Profile:
    def role(title, company, start, end=None, current=False):
        return {
            "id": title,
            "role": title,
            "company": company,
            "start": {"month": 0, "year": start},
            "end": end and {"month": 11, "year": end},
            "current": current,
            "bullets": [f"{title} work"],
        }

    return Profile.model_validate(
        {
            "name": "Ada",
            "experiences": [
                role("Lead", "Acme S.p.A.", 2023, current=True),
                role("Engineer", "ACME", 2020, 2022),
                role("Intern", "Beta", 2019, 2019),
                role("Contractor", "Acme", 2018, 2018),
            ],
        }
    )


def test_roles_at_one_company_are_grouped():
    out = cv_render.render("standard", _roles_profile(), "en")
    jobs = re.findall(r'<div class="((?:ca-\w+ )?job)">', out)
    # Lead and Engineer grouped; Beta breaks the run, so the later Acme role stands alone.
    assert jobs == ["ca-company job", "ca-role job", "job", "job"]
    # The group's header spans both roles; each role keeps its own dates after its title.
    assert "Jan 2020 – Present" in out
    assert 'Lead <span class="ca-role-period">· Jan 2023 – Present</span>' in out
    assert 'Engineer <span class="ca-role-period">· Jan 2020 – Dec 2022</span>' in out
    assert '"ca-role-period"' not in out.split("Intern")[1].split("</div>")[0]
    # Lead and Engineer share no place here, so nothing is written for either.
    assert "job-location" not in out.split("</head>")[1]
    # Every role's bullets stay in order.
    assert [b for b in re.findall(r"<li>(\w+) work</li>", out)] == [
        "Lead",
        "Engineer",
        "Intern",
        "Contractor",
    ]


def test_ats_keeps_one_line_per_role():
    out = cv_render.render("ats", _roles_profile(), "en")
    assert "ca-company" not in out.split("</head>")[1]
    assert "ca-role-period" not in out.split("</head>")[1]
    assert out.count('<div class="job-company">') == 4


def test_a_shared_place_is_written_once_per_company():
    p = _roles_profile()
    for e in p.experiences:
        e.location = "Milano"
    out = cv_render.render("standard", p, "en").split("</head>")[1]
    # Lead (written), Engineer (shared, skipped), Intern, Contractor.
    assert out.count('<div class="job-location">Milano</div>') == 3


def test_korean_cv_words_and_dates():
    out = cv_render.render("standard", _roles_profile(), "ko")
    assert '<html lang="ko"' in out
    assert ">경력<" in out
    # Korean CVs write dates as year.month.
    assert "2020.01 – 현재" in out
    assert "2020.01 – 2022.12" in out
