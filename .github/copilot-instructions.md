# Copilot instructions — Power CAT Copilot Studio Kit

These instructions guide the GitHub Copilot coding agent (and any human
contributor reading them) when working in this repository.

## Repository at a glance

The Power CAT Copilot Studio Kit ships:

- **Power Platform solution files** (top-level folders) — the actual Kit
  components: validation framework, library components, governance tooling,
  agent inventory, etc. These get packaged and imported into customer
  environments.
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

## Branching strategy

| Branch | Purpose |
|---|---|
| `main` | Default. Solution files, top-level docs, this instructions file, the `copilot-setup-steps.yml` workflow. |
| `feature/github-pages-agent` | GitHub Pages source. `docs/**` pushes here trigger deploy. **Target this branch for landing-page PRs.** |
| Topic branches | Always branch off the appropriate base above. Use kebab-case names. |

## Commit message conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `style:`, `docs:`, `refactor:`, `chore:`, `ci:`.

Scope landing-page commits with `(pages)`: e.g., `feat(pages): lighten hero palette`.

Always include the trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Setup-steps environment

The `.github/workflows/copilot-setup-steps.yml` workflow preinstalls Node 20
and `npm ci`s `agent-review-pipeline/` before any Copilot session starts. If you change
dependencies in `agent-review-pipeline/package.json`, the cache invalidates automatically
(keyed on `package-lock.json`).

## When in doubt

- Visual / UX questions → mirror https://adoption.microsoft.com/en-us/copilot/
- Brand color → `#833D91` (purple); the six-stop rainbow is decorative
- Component library → built on the [Agent Archetype Framework](https://learn.microsoft.com/en-us/agents/agent-archetypes/framework-apply)
  3Cs model (Categories / Capabilities / Components)
- Need more context on the kit overall → see the top-level [README.md](../README.md)
  and https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/copilot-studio-kit-overview
