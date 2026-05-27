# AGENTS.md — Copilot Agent Kit landing page

This file gives Copilot (and any other coding agent) the context needed to ship
changes to the GitHub Pages site at https://microsoft.github.io/Power-CAT-Copilot-Studio-Kit/.

Read **this whole file** before making changes. The aesthetic, build pipeline,
and branching strategy all have gotchas.

---

## TL;DR — what you usually need to do

1. Edit files under `site-src/src/` (most often `theme.ts`, `App.tsx`, or `features.ts`).
2. Run `cd site-src && npm ci && npm run build`. This writes the bundle into `../docs/`.
3. Verify the build with `node smoke-test.mjs` (puppeteer-core, runs against `npx serve docs -p 4173`).
4. **Commit BOTH `site-src/` changes AND the rebuilt `docs/` artifacts** in the same commit.
5. Open the PR against the **`feature/github-pages-agent`** branch — NOT `main`.

---

## Project architecture

| Path | What it is |
|---|---|
| `site-src/` | Source: Vite + React 19 + Fluent UI v9 + TypeScript SPA. Edit here. |
| `site-src/src/theme.ts` | **Single source of truth for all colors / gradients / shadows / typography.** Start here for any visual change. |
| `site-src/src/App.tsx` | Single-page app (~1300 lines). All sections, styles, and the `<Reveal>` scroll-animation component live here. |
| `site-src/src/features.ts` | 15-feature catalog + pillar-color map. Edit when content changes. |
| `site-src/vite.config.ts` | Vite config. **Do not change** — `outDir: '../docs'`, `emptyOutDir: false`, stable `assets/index.js` filename are all load-bearing. |
| `docs/` | Built bundle. **Committed to git** (this is the GH Pages source). Regenerate via `npm run build`. |
| `docs/.nojekyll` | Bypasses Jekyll on GH Pages. Do not delete. |
| `docs/images/` | Static images (favicons, OG images, etc.). Preserved across builds because `emptyOutDir: false`. |
| `docs/assets/index.js` | The Vite build output. Replaced on every build. |
| `.github/workflows/deploy-pages.yml` | Triggers on push to `feature/github-pages-agent` for paths `docs/**`. |

---

## Build, preview, and verify

```bash
cd site-src
npm ci                  # one-time / when package.json changes
npm run build           # writes to ../docs/
```

After every change, **verify by running**:

```bash
# In a separate terminal, serve docs/ on port 4173
npx serve ../docs -p 4173 &

# Then smoke-test the build (puppeteer-core)
node smoke-test.mjs
```

The smoke test checks: no JS errors, no console errors, hero renders, scroll
reveals fire, "Ask the Kit" button opens the chat iframe. If it fails, **do
not commit**.

`site-src/smoke-test.mjs` is gitignored — it's a local-only dev tool. Recreate
it from scratch if needed; a minimal version is fine.

---

## Design system (aesthetic = adoption.microsoft.com)

The site mirrors https://adoption.microsoft.com/en-us/copilot/ — light, airy,
near-white sections with painterly pastel washes, a 5-stop rainbow accent bar,
and Fluent UI v9 components.

### Color palette (all defined in `theme.ts`)

```ts
cream:    "#FBF6F1"   // warm near-white — primary section bg
dusty:    "#F7F1F9"   // cool near-white — alternating section bg
creamSoft, dustySoft  // even softer (almost white) — used for table head, hover
creamRich, dustyRich  // original adoption.microsoft.com saturation — kept for
                      // table headers, icon badges, badges only
border:   "#EDE6E0"   // soft border on cards
```

**The palette has been deliberately dialed down from adoption.microsoft.com's
saturated values (`#F1E8E1` / `#E5D8EA`) which they reserve for modals. Our
sections use the lightened values to read as "mostly white with a hint".**

### Gradients

```ts
gradientBar           // 45deg, six-stop deep rainbow — used as top page bar,
                      //   section accent strips, the framework callout bar
gradientText          // to-right, six-stop bright rainbow — section title highlights
gradientHeroLayered   // dark-to-transparent overlay + brighter rainbow,
                      //   used as background-clip text on the hero h1
```

The hero overlay is `rgba(0,0,0,0.30)` — much lighter than adoption.microsoft.com's
0.75 — because our hero sits on white, not a textured dark bg. Keep it low.

### Scroll reveal pattern

All major content blocks animate in via the `<Reveal>` component in `App.tsx`:

```tsx
<Reveal variant="up" delay={i * 90}>
  ...content...
</Reveal>
```

- `variant`: `"up" | "fade" | "left" | "right" | "scale"` (default `"up"`)
- `delay`: ms, used to stagger neighboring cards (typical `i * 80` to `i * 120`)
- Respects `prefers-reduced-motion` (returns content unwrapped)
- Uses `IntersectionObserver` with `rootMargin: '0px 0px -10% 0px'`, fires once
- Reveals set a `data-reveal="in|out"` attribute for inspection/testing

**Any new content block should be wrapped in `<Reveal>`.** The smoke test
expects a count of reveals — increasing it is fine, dropping below the current
count is a regression.

### Fluent UI v9 conventions

- Use Fluent components: `<Button>`, `<Badge>`, `<Subtitle1>`, `<Text>`, etc.
- Use `<Button as="a" {...{ href, target, rel }}>` for external links (the
  `as="a"` typing in v9 narrows away `href`/`target`, so we spread them via
  `{...{ ... }}` to bypass).
- Use `mergeClasses(...)` for combining Griffel classes.
- Use Fluent icons from `@fluentui/react-icons`.
- The brand color is `#833D91` (`pillarQuality`); the rainbow is decorative.

---

## Sections (in render order in `App.tsx`)

1. **Top accent bar** — 5px `gradientBar`
2. **Header** — sticky nav with logo + sections + GitHub button
3. **Hero** — white bg, layered gradient h1, subtitle, CTAs, stat cards
4. **Free & Open Source** — white section, four "free" claims
5. **Pillars** — cream section, 4 pillar cards (Quality, Governance, Analytics, Components)
6. **Features** — dusty section, 15-feature table grouped by pillar
7. **Components** — white section, framework callout, 6 component cards
8. **Get Started** — cream section, 3-step quickstart
9. **CTA** — dusty section, primary CTAs
10. **Footer** — white, GitHub + docs links

When adding a new section, pick a bg that alternates with its neighbors
(`sectionCream` / `sectionDusty` / `sectionWhite`).

---

## Branching strategy (CRITICAL)

| Branch | Role |
|---|---|
| `main` | Repo default. Holds the kit components, NOT the site source. The `copilot-setup-steps.yml` and `copilot-instructions.md` files live here. |
| `feature/github-pages-agent` | **GitHub Pages source branch.** `docs/**` pushes here trigger the deploy workflow. |
| `demora-adoption-aesthetic-redesign` | The current redesign work, branched off `feature/github-pages-agent`. |

**Always**:
- Branch your work off `feature/github-pages-agent` (or off the latest redesign
  branch if one is in flight).
- Open PRs against `feature/github-pages-agent`, NOT `main`.
- Include both `site-src/` source changes AND the rebuilt `docs/` artifacts in
  the same commit so the deploy workflow has the up-to-date bundle.

---

## What NOT to do

- ❌ Don't edit `docs/assets/index.js` directly. It's generated.
- ❌ Don't delete `docs/.nojekyll` or `docs/images/`. Vite's `emptyOutDir: false`
  preserves them — if you change that setting, you'll wipe them out.
- ❌ Don't open PRs against `main`. Always target `feature/github-pages-agent`.
- ❌ Don't commit `site-src/node_modules/` or `site-src/dist/` (both gitignored).
- ❌ Don't use Tailwind, Bootstrap, or vanilla CSS. We use Griffel via
  Fluent UI v9 `makeStyles`.
- ❌ Don't introduce icons from outside `@fluentui/react-icons`.
- ❌ Don't bump dependency major versions unless explicitly asked. Stick to
  React 19 / Fluent v9 / Vite 5.

---

## When in doubt

- **Visual question?** Check adoption.microsoft.com for reference. The "feel"
  should match: light, airy, painterly, Microsoft-y.
- **"Make X lighter / brighter / more colorful"?** Almost always a `theme.ts`
  change. Touch nothing else first.
- **New section?** Mirror the structure of an existing section, wrap in
  `<Reveal>`, alternate the bg color.
- **New feature?** Add to `features.ts`, the table renders automatically.
- **Commit message format?** Use Conventional Commits (`feat:`, `fix:`,
  `style:`, `docs:`). Include
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
