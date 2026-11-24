# `review-core`

The shared vocabulary of a review: pillars and their weights, severity, harness,
and grade bands.

It lives in ART because ART owns the rubric. ARC2 states this in its own code —
`models/art.ts:11`, *"Nothing here re-derives a score. ART owns the rubric; this
app reads it."* — and the dependency graph enforces it: ARC2 aliases `@art/*` to
this tree, while ART has no alias to ARC2 and imports nothing from it. A module
placed on the ARC2 side could never be reached by ART, so it could never be a
single source of truth for both.

## Rules for this folder

1. **No imports.** These modules are the base of the dependency graph. Anything
   that needs a type from elsewhere does not belong here.
2. **No I/O, no host APIs, no React.** Safe to import from a browser bundle, a
   Node worker and a test.
3. **A weight literal appears here and nowhere else.** Other modules re-export or
   derive. A second table that "happens to agree" is the defect this folder
   exists to remove.
4. **An id is data; a label is copy.** Ids are lower-case and persisted. Title-case
   spellings are display text, or a translation of historic rows.

## Who consumes it

| Consumer | Via |
|---|---|
| ART scoring | relative import |
| ART skill rubric | relative import |
| ARC2 engine and UI | `@art/review-core`, re-exported through `engine/scoring/art-ports.ts` |

ARC2 reaches this folder through `art-ports.ts` rather than importing it
directly, for the reason stated in that file's header: only the host-agnostic
half of ART may cross the boundary.
