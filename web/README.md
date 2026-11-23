# career-agent UI

React 19, TypeScript and Vite, with [shadcn/ui](https://ui.shadcn.com) components on Tailwind CSS v4. The build is
served by the Python backend; see the [project README](../README.md) for what the app does.

```bash
npm install
npm run dev      # :5173, proxies /api to the backend on :8000 (start it with `uv run career-agent`)
npm run build    # type-checks, then writes the bundle to ../src/career_agent/static
npm test         # Vitest
npm run lint     # oxlint
```

## Structure

```
src/
  main.tsx            Providers (theme, URL state, React Query, tooltips, toasts); loads the profile
  App.tsx             Header, navigation, search page and results
  components/
    composer/         The search bar: typed text → filter pieces in a sentence
    filters/          Editors for each filter
    jobs/             Results table, posting sheet, work-mode badge
    run/              Starting a board search and following its progress
    saved/            Saved searches
    profile/          Profile page: onboarding, import progress, view, edit dialogs
    cv/               Tailored CV (mock)
    settings/         Preferences: theme, language, AI engine
    ui/               shadcn/ui components, generated (`npx shadcn add …`)
  lib/
    api.ts            Typed client for the backend; sends Accept-Language
    filters.ts        Filter state in the URL (nuqs) and its conversion to the API query
    compose.ts        Parses typed text into filter suggestions (it/en/de words)
    queries.ts        React Query hooks: jobs, run status, saved searches, places
    profile.ts        Profile types, helpers and store (see below)
    i18n.ts           Locale store and `useT()`
  locales/            it.ts (reference), en.ts, de.ts
```

## Conventions

**State.** Filters live in the URL, so a link reproduces a search. Server data goes through React Query. The
profile has its own store (`lib/profile.ts`, read with `useProfile()`), because the header, the profile page and
the posting sheet share it and its saves need ordering:

- edits to the saved profile are sent at once, one request at a time, latest edit wins;
- edits to an import draft are debounced and stay in the draft until it's confirmed;
- a running import is polled every 1.5 s.

**Copy.** No user-facing string in components: they come from `useT()` (or `msgs()` outside React).
`locales/it.ts` is the reference: `en.ts` and `de.ts` are typed against it, so a missing or extra key fails the
build, and `i18n.test.ts` checks it too. Values are strings, or functions for plurals and interpolation. Data is
stored as keys (`"hybrid"`, `"fulltime"`) and labelled at render time. Dates and numbers are formatted with `Intl`
in the UI's locale.

**Components.** Use shadcn/ui primitives before writing new ones; add missing ones with `npx shadcn add`.

**Tests.** `src/test-setup.ts` pins the locale to Italian, so tests don't depend on the machine's language. Store
tests mock `fetch` and use fake timers.
