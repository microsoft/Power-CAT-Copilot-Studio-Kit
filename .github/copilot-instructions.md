# Copilot instructions — Power CAT Copilot Studio Kit

These instructions guide the GitHub Copilot coding agent (and any human
contributor reading them) when working in this repository.

## Repository at a glance

The Power CAT Copilot Studio Kit ships:

- **Power Platform solution files** (top-level folders) — the actual Kit
  components: validation framework, library components, governance tooling,
  agent inventory, etc. These get packaged and imported into customer
  environments.
- **Code apps** under `code-apps/` (Vite + React 19 + Fluent UI v9 +
  TypeScript) — the source code of the Power Apps code apps Copilot Agent Kit
  for Makers (`code-apps/makers`) and Copilot Agent Kit for Admins
  (`code-apps/admin`). The Kit solution installs these apps.
- **A GitHub Pages landing page** at https://microsoft.github.io/Power-CAT-Copilot-Studio-Kit/
  built from `site-src/` (Vite + React 19 + Fluent UI v9 + TypeScript) and
  deployed from `docs/` on the `feature/github-pages-agent` branch.
- **Documentation** under `docs/` (the landing-page assets) and other top-level
  `.md` files.

## Most tasks fall into one of these buckets

### 1. Landing-page changes (`site-src/`)

This is the **most common** kind of issue from the team — visual tweaks, copy
edits, new sections, link updates on the github.io page.

> **Note:** `site-src/` and its contents (including `site-src/AGENTS.md`,
> `site-src/src/`, and `site-src/package.json`) exist only on the
> `feature/github-pages-agent` branch. These files are **not present on `main`**
> and will land there via a separate redesign PR.

**Read `site-src/AGENTS.md` (on the `feature/github-pages-agent` branch) before touching anything in `site-src/`.**
It has the design tokens, the build pipeline, the scroll-reveal pattern, and
the branching strategy.

Key rules for landing-page work:

- Edit source in `site-src/src/` (most often `theme.ts`, `App.tsx`, `features.ts`)
- Build with `cd site-src && npm ci && npm run build`
- The build writes into `../docs/` (committed — this is the Pages source)
- Commit **both** source AND rebuilt `docs/` artifacts in the same commit
- **Open the PR against the `feature/github-pages-agent` branch**, NOT `main`
- The Pages deploy workflow only fires on pushes to `feature/github-pages-agent`
  that touch `docs/**`

### 2. Solution / component changes

Power Platform solution work happens at the top level (`Solutions/`,
`CopilotStudioKit/`, etc.). These typically require manual export from
maker.powerapps.com or pac CLI — Copilot can review diffs and update docs but
should not invent solution XML by hand. If an issue asks for a solution
change, propose a plan and request human confirmation before unpacking
solution files.

### 3. Docs / README updates

Standard markdown edits. No build step. Open PRs against `main`.

### 4. Code-app changes (`code-apps/`)

Read `code-apps/README.md` and the `README.md` of the app before you change
anything in `code-apps/`. For all the rules, see
[Contribute to the code apps](../CONTRIBUTING.md#contribute-to-the-code-apps).

Key rules for code-app work:

- Use Node.js 22.13 or later. Run `npm ci` in `code-apps/makers` or
  `code-apps/admin`. Do not use `npm install`.
- In each app that you change, run `npm run build`, `npm test`, and
  `npm run lint`. All tests must pass. Lint must report 0 errors and no new
  warnings. After the checks, `git status --porcelain` must show no output.
- Do not skip, remove, or weaken a test. Add a test for each bug fix.
- Do not change dependency versions or `package-lock.json` unless the issue
  asks for it.
- Keep the placeholder values in `power.config.json`. Do not commit the IDs of
  environments, apps, or flows. Do not commit secrets.
- Do not write user data (names, email addresses, user IDs, tokens) to the
  browser console.
- The Agent Library code in `src/features/agent-library/library` is the same in
  both apps. Make each change in both copies.
- Use LF line ends.
- The apps need a Power Platform environment and a signed-in user, so you
  cannot run them in a Copilot session. Do not run `npx power-apps` commands.
  Check your change with the build, the tests, and the lint. In the PR, tell
  the reviewer what to test in the app.
- Open the PR against `main`.

## Branching strategy

| Branch | Purpose |
|---|---|
| `main` | Default. Solution files, the code-app source (`code-apps/`), top-level docs, this instructions file, the `copilot-setup-steps.yml` workflow. |
| `feature/github-pages-agent` | GitHub Pages source. `docs/**` pushes here trigger deploy. **Target this branch for landing-page PRs.** |
| Topic branches | Always branch off the appropriate base above. Use kebab-case names. |

## Commit message conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `style:`, `docs:`, `refactor:`, `chore:`, `ci:`.

Scope landing-page commits with `(pages)`: e.g., `feat(pages): lighten hero palette`.

Scope code-app commits with `(makers)`, `(admin)`, or `(code-apps)` for a
change to both apps: e.g., `fix(makers): keep the review filter after a refresh`.

Always include the trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Setup-steps environment

The `.github/workflows/copilot-setup-steps.yml` workflow runs before every
Copilot session and preinstalls Node 20, then conditionally `npm ci`s any
Node sub-project whose `package-lock.json` is present in the checked-out
branch:

- **`site-src/`** — landing page (Vite + React + Fluent UI v9). Present on
  `feature/github-pages-agent`.
- **`agent-review-pipeline/`** — GitHub Action helper. Present on `main`.

Each step is guarded with `hashFiles(...) != ''` so it's a silent no-op on
branches where the project isn't present (e.g. `site-src/` on `main` before
the redesign PR lands). The npm cache is keyed on each project's
`package-lock.json` so dependency changes automatically invalidate it.

The workflow does not install the code apps in `code-apps/`. They need
Node.js 22.13 or later, but the workflow sets up Node 20. Before you run
`npm ci` in `code-apps/makers` or `code-apps/admin`, make sure that
`node --version` shows 22.13 or later. If you cannot get that version, tell
the reviewer in the PR that you did not run the checks.

## When in doubt

- Visual / UX questions → mirror https://adoption.microsoft.com/en-us/copilot/
- Brand color → `#833D91` (purple); the six-stop rainbow is decorative
- Component library → built on the [Agent Archetype Framework](https://learn.microsoft.com/en-us/agents/agent-archetypes/framework-apply)
  3Cs model (Categories / Capabilities / Components)
- Code apps → the `README.md` of the app (`code-apps/makers` or `code-apps/admin`)
- Need more context on the kit overall → see the top-level [README.md](../README.md)
  and https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/copilot-studio-kit-overview
