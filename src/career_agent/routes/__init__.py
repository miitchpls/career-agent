"""The JSON API, one router per area (as career-ops' web/src/app/api/<area>/)."""

from . import ai, applications, cv, fit, jobs, profile, search

ROUTERS = [
    jobs.router,
    search.router,
    applications.router,
    fit.router,
    cv.router,
    profile.router,
    ai.router,
]
