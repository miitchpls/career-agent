# CV templates

Copied from [career-ops](https://github.com/career-ops-hq/career-ops) (`templates/` at commit `f8e4beb`, 2026-11-24; MIT licence, see
`LICENSE-career-ops`), unchanged. `career_agent/cv_render.py` fills them the way career-ops' `build-cv-html.mjs`
does: same placeholders, same section partials (`sections/`, and `ats/sections/` for the ATS pack), same removal
of empty sections.

To update, copy the files again from career-ops' `templates/` and run the tests: `tests/test_cv_render.py`
renders every template and fails on any placeholder left unfilled.
