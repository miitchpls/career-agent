import re

import pytest
from fastapi.testclient import TestClient

from career_agent import cv_render
from career_agent.app import app
from career_agent.profile import Profile

client = TestClient(app)


@pytest.mark.parametrize("template", list(cv_render.TEMPLATES))
@pytest.mark.parametrize("lang", ["it", "en", "de"])
def test_every_template_renders_the_profile(template, lang):
    out = cv_render.render(
        template, cv_render.sample_profile(), lang, "a4", photo=False
    )
    assert "Alex Moretti" in out and "Fintrail" in out and "pgqueue" in out
    assert cv_render.WORDS[lang]["experience"] in out
    assert not re.search(r"\{\{[A-Z_]+\}\}", out)  # nothing left unfilled
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


def test_preview_endpoint_uses_the_profile_or_the_sample():
    r = client.post("/api/cv/preview", json={"template": "jake", "language": "de"})
    assert r.status_code == 200 and r.json()["sample"] is True
    assert "Berufserfahrung" in r.json()["html"]
    mine = {
        "name": "Giulia Ferri",
        "experiences": [{"id": "e", "role": "Data Engineer", "company": "Lumen"}],
    }
    r = client.post("/api/cv/preview", json={"template": "ats", "profile": mine})
    assert r.json()["sample"] is False and "Giulia Ferri" in r.json()["html"]
    assert client.post("/api/cv/preview", json={"template": "fancy"}).status_code == 422


def test_old_style_names_are_migrated():
    from career_agent import db

    db.set_setting("cv_prefs", '{"style": "classic", "format": "letter"}')
    prefs = client.get("/api/cv/preferences").json()
    assert prefs["style"] == "executive" and prefs["format"] == "letter"
