/**
 * The runtime-awareness rules (spec 018, group F) over an uploaded skill.
 *
 * These are the third class of `standalone-skill` metadata rules moving out of
 * `agents-experience/services/skill/skillRuleRegistry.ts`, and they sit on the
 * seam `skill-packaging.rules.ts` established: one declaration, projected two
 * ways — `rule` is the shape the core registry wants, `definition` is the legacy
 * `SkillRuleDefinition` row `createRegisteredFinding` has always read.
 *
 * They reuse that seam's context, options, population and — crucially — its
 * `definition` projection unchanged. What they deliberately do **not** reuse is
 * its generated check, and the rest of this comment is why.
 *
 * ── These four rules are AI rules, not deterministic ones ──────────────────
 *
 * Each asks the same question: does this skill actually *depend* on the thing it
 * mentions? A skill that says "unlike browser-based tools, this uses Graph"
 * mentions browser automation without depending on it. Telling a dependency
 * apart from a mention is a reading task, so the verdict belongs to the
 * `standalone-skill` node and not to a scanner here.
 *
 * These rules therefore declare `execution: 'ai'` and carry **no `check`** —
 * the registry's invariant for an AI rule (`registry.ts:197`). {@link
 * skillRuntimeRule} sets that over the `'deterministic'` the seam fills in, and
 * `nodesFor` consequently routes all four to the `standalone-skill` node, which
 * is handed each rule's full contract — title, question, pass/fail clauses, fix
 * and references — from the `definition` rows below. One authority for the
 * wording, one place that reaches a verdict.
 *
 * ── Why there is no deterministic half ─────────────────────────────────────
 *
 * There used to be one. `skills-automations/services/runtimeRules.ts` scanned
 * for these four and emitted every hit as a *candidate* — `source: 'hybrid'`,
 * `pendingConfirmation: true`, severity stepped down — which the AI layer was
 * then asked to confirm. That third mode is gone, and the scanner with it. It
 * could not survive contact with the rest of the model for three reasons, each
 * of which is worth keeping on record because they are the reasons not to
 * reintroduce it:
 *
 * 1. **A candidate is not a verdict.** `packagingCheck` reduces
 *    `hits.length > 0` straight to `failWith(...)`, which would promote an
 *    unconfirmed mention into a confirmed blocker. Avoiding that cost the
 *    scoring path a parallel weighting rule and the release gates a parallel
 *    exclusion — three subsystems carrying one flag.
 * 2. **Severity was stepped per target runtime, not per rule.** One finding per
 *    selected runtime, each with its own staleness- and provenance-stepped
 *    severity. `RuleOutcome` carries one verdict and `Rule.severity` one
 *    severity, so N stepped severities collapsed onto the strongest.
 * 3. **The context could not see the flag.** `SkillPackagingContext` types its
 *    findings as `GroundedSkillFinding`; `pendingConfirmation`, `source` and
 *    `runtimes` are declared on `ArtifactFinding`, which extends it. A faithful
 *    check could only recover them with an unchecked cast.
 *
 * Routing the question to the node that can answer it removes all three at
 * once, and leaves one way for a rule to be answered deterministically and one
 * way for it to be answered by a model.
 */

import type {
  TargetRuntime, UploadedArtifact,
} from '../../skills-automations/contracts/ArtifactReview';
import { RUNTIME_LABELS } from '../../skills-automations/contracts/ArtifactReview';
import type { PlatformCatalogue } from '../../skills-automations/contracts/PlatformCatalogue';
import { formatCatalogueDate } from '../../skills-automations/contracts/PlatformCatalogue';
import { resolveCatalogue } from '../../skills-automations/data/catalogueResolver';
import {
  findFile, parseFrontmatter, readString, readStringArray, stripRoot,
} from '../../skills-automations/services/artifactUtils';
import {
  rule,
  type Rule,
} from '../rule';
import {
  noPopulation, populated, skillPackagingRule, unreadablePopulation,
  type SkillPackagingContext, type SkillPackagingOptions, type SkillPackagingPopulation,
  type SkillPackagingRuleEntry, type SkillRuleDefinition,
} from './skill-packaging.rules';

/** The family the runtime-awareness rules publish under. */
const RUNTIME_RULE_FAMILY = 'Runtime';

/**
 * What an author writes, borrowed from the seam rather than restated.
 *
 * Taken off {@link skillPackagingRule}'s signature so this file cannot drift
 * from the declaration shape the projection actually consumes.
 */
type SkillRuntimeDeclaration = Parameters<typeof skillPackagingRule>[0];

// ── Shared bundle readers ──────────────────────────────────────────────────

/**
 * How far the deleted `evaluateRuntime` scanner got before it would have given up.
 *
 * All four rules share one precondition, and it is the detector's own first two
 * lines: `findFile(artifact, 'SKILL.md')` then `if (!skillFile?.text) return []`.
 * A bundle that fails it produced no runtime findings at all, and the three ways
 * it can fail are three different answers — a missing file is PKG-REQ's failure,
 * an undecodable one is an infrastructure status, and an empty one is simply
 * nothing to read.
 */
type ManifestState =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable'; readonly path: string }
  | { readonly kind: 'empty'; readonly path: string }
  | { readonly kind: 'read'; readonly path: string; readonly markdown: string };

function readSkillMarkdown(artifact: UploadedArtifact): ManifestState {
  const file = findFile(artifact, 'SKILL.md');
  if (!file) return { kind: 'missing' };

  const path = stripRoot(file.path, artifact.rootFolderName);
  if (file.isBinary || typeof file.text !== 'string') return { kind: 'unreadable', path };
  if (file.text === '') return { kind: 'empty', path };
  return { kind: 'read', path, markdown: file.text };
}

/**
 * The tool names the skill declares, read exactly as the detector reads them.
 *
 * Both spellings, in the detector's order. Imported rather than reimplemented
 * for the reason the packaging seam gives: a second frontmatter reader here
 * could disagree with the one that produced the finding the maker is reading.
 */
function declaredToolNames(markdown: string): string[] {
  const frontmatter = parseFrontmatter(markdown);
  return [
    ...readStringArray(frontmatter.data, 'allowed-tools'),
    ...readStringArray(frontmatter.data, 'allowed_tools'),
  ];
}

function declaredSkillName(markdown: string): string | undefined {
  return readString(parseFrontmatter(markdown).data, 'name');
}

/** The catalogues behind the selected runtimes, in the order the detector visits them. */
function selectedCatalogues(runtimes: readonly TargetRuntime[]): PlatformCatalogue[] {
  return runtimes.map(resolveCatalogue);
}

/** `Copilot Cowork (list of 28 July 2026)`, for a pass sentence that says what was measured. */
function describeCatalogue(catalogue: PlatformCatalogue): string {
  return `${RUNTIME_LABELS[catalogue.runtime]} (list of ${formatCatalogueDate(catalogue.snapshotDate)})`;
}

function describeCatalogues(catalogues: readonly PlatformCatalogue[]): string {
  return catalogues.map(describeCatalogue).join(', ');
}

/** The runtimes the reviewer chose, named as the product names them. */
function describeRuntimes(runtimes: readonly TargetRuntime[]): string {
  return runtimes.map(runtime => RUNTIME_LABELS[runtime]).join(', ');
}

/**
 * The precondition every runtime rule shares, as a population step.
 *
 * Returns a state when the rule cannot proceed, and `undefined` when it can.
 * Written as a guard rather than a base population because each rule still has
 * its own subject after this passes.
 */
function runtimePrecondition(ctx: SkillPackagingContext) {
  if (ctx.runtimes.length === 0) {
    return noPopulation(
      'No target runtime was selected, and a runtime-awareness rule compares the skill against '
      + 'a runtime. With none in scope there is nothing to compare it to.',
    );
  }

  const manifest = readSkillMarkdown(ctx.artifact);
  switch (manifest.kind) {
    case 'missing':
      return noPopulation(
        'This bundle contains no SKILL.md, so it describes no steps or tools to judge against a '
        + 'runtime. The missing file is reported by PKG-REQ.',
      );
    case 'unreadable':
      return unreadablePopulation(
        `"${manifest.path}" is binary or failed to decode, so none of its content could be read.`,
      );
    case 'empty':
      return noPopulation(
        `"${manifest.path}" is empty, so it describes no steps or tools to judge against a runtime.`,
      );
    default:
      return undefined;
  }
}

/** The SKILL.md body, once {@link runtimePrecondition} has cleared. */
function skillMarkdown(ctx: SkillPackagingContext): string {
  const manifest = readSkillMarkdown(ctx.artifact);
  return manifest.kind === 'read' ? manifest.markdown : '';
}

// ── The declaration seam ───────────────────────────────────────────────────

/**
 * Declares one runtime rule.
 *
 * Builds the entry through {@link skillPackagingRule} so the `definition`
 * projection stays the seam's — the legacy row is derived by exactly the code
 * that derives every other migrated row, and cannot drift from it — then
 * corrects the two fields the seam fills in for a deterministic rule:
 *
 * - `execution` becomes `'ai'`. The seam hard-codes `'deterministic'` because
 *   every rule it was written for is, but these four are not: each asks whether
 *   a skill genuinely *depends* on something it mentions, which no scanner can
 *   decide. `nodesFor` returns `[]` for a deterministic rule and
 *   `['standalone-skill']` for this one, so declaring it honestly is what routes
 *   the rule to the node that answers it.
 * - The generated `check` is dropped. `execution: 'ai'` with no `check` is the
 *   registry's invariant for an AI rule (`registry.ts:197`), and it is the whole
 *   point here: the verdict belongs to the node, and a second narrower copy in
 *   this file would only produce disagreements a reviewer has to adjudicate.
 *
 * A legacy `dimension` that disagrees with the one `pillar` derives is pinned
 * through `SkillPackagingOptions.legacyDimension` in the seam, not here, and
 * every use of it is marked `// DIVERGENCE:` at the call site.
 */
function skillRuntimeRule(
  declaration: SkillRuntimeDeclaration,
  options: SkillPackagingOptions,
): SkillPackagingRuleEntry {
  const generated = skillPackagingRule(declaration, options);
  const { check: _generatedCheck, ...metadata } = generated.rule;
  const declared: Rule<SkillPackagingContext> = { ...metadata, execution: 'ai' };
  return Object.freeze({ rule: rule(declared), options, definition: generated.definition });
}

// ── Populations ────────────────────────────────────────────────────────────

/**
 * Browser-automation mentions, under a runtime that publishes no browser tools.
 *
 * The gate is the detector's own: `if (catalogue.supportsBrowserAutomation ===
 * false)`. An `'unknown'` catalogue — Copilot Studio, where tool access is
 * per-agent configuration — publishes no capability surface, so even a pending
 * claim there would be a guess, and a runtime that *does* ship browser tools has
 * nothing to answer. Both are not-applicable rather than a pass: no comparison
 * was made, and crediting one that never happened is the free-credit bug.
 */
export const BROWSERLESS_RUNTIME_SURFACE: SkillPackagingPopulation = Object.freeze({
  label: 'browser automation under a runtime that publishes no browser tools',
  resolve: (ctx: SkillPackagingContext) => {
    const blocked = runtimePrecondition(ctx);
    if (blocked) return blocked;

    const browserless = selectedCatalogues(ctx.runtimes)
      .filter(catalogue => catalogue.supportsBrowserAutomation === false);
    if (browserless.length === 0) {
      return noPopulation(
        `None of the selected runtimes (${describeRuntimes(ctx.runtimes)}) publishes a tool `
        + 'surface that excludes browser automation — one either ships browser tools or declares '
        + 'its tool access to be per-agent configuration — so there is no published absence to '
        + 'compare the skill against.',
      );
    }

    return populated(
      'The skill\'s declared tools and prose were compared against the browser-automation surface '
      + `published by ${describeCatalogues(browserless)}.`,
    );
  },
});

/**
 * The tool names the skill declares, and the runtime tool lists they are read
 * against.
 *
 * Two gates, both the detector's. A catalogue with an empty tool list is skipped
 * outright — `if (catalogue.tools.length > 0)` — because there "not found" means
 * "not configured yet", not "not available. And a skill that declares no tools
 * gave the detector's `for (const tool of declaredTools)` nothing to iterate, so
 * no name was checked against any list. Neither is a pass.
 */
export const DECLARED_TOOLS_AGAINST_CATALOGUE: SkillPackagingPopulation = Object.freeze({
  label: 'declared tool names',
  resolve: (ctx: SkillPackagingContext) => {
    const blocked = runtimePrecondition(ctx);
    if (blocked) return blocked;

    const publishing = selectedCatalogues(ctx.runtimes)
      .filter(catalogue => catalogue.tools.length > 0);
    if (publishing.length === 0) {
      return noPopulation(
        `None of the selected runtimes (${describeRuntimes(ctx.runtimes)}) publishes a tool list. `
        + 'Where tool access is per-agent configuration, a tool missing from a list is not a tool '
        + 'the runtime does not provide.',
      );
    }

    const declared = declaredToolNames(skillMarkdown(ctx));
    if (declared.length === 0) {
      return noPopulation(
        'The SKILL.md frontmatter declares no allowed-tools, so the skill names no tool to look '
        + "up in a runtime's published list.",
      );
    }

    return populated(
      `${declared.length} declared tool(s) were looked up in the tool lists published by `
      + `${describeCatalogues(publishing)}.`,
    );
  },
});

/**
 * The SKILL.md prose, read for a web-driving step that a command-line tool
 * already does.
 *
 * The only rule of the four with no catalogue gate, and that is the detector's
 * behaviour rather than an omission: its `if (catalogue.preferredClis && ...)`
 * guard skips a runtime that publishes a CLI list *without* the relevant tool,
 * and passes straight through one that publishes no list at all. So the question
 * is asked of every selected runtime, and the subject is simply the prose.
 */
export const WEB_DRIVING_PROSE: SkillPackagingPopulation = Object.freeze({
  label: 'SKILL.md prose',
  resolve: (ctx: SkillPackagingContext) => {
    const blocked = runtimePrecondition(ctx);
    if (blocked) return blocked;

    return populated(
      'The SKILL.md prose was read for steps that drive a website which publishes a command-line '
      + `tool, for ${describeRuntimes(ctx.runtimes)}.`,
    );
  },
});

/**
 * The declared skill name, and the built-in skills it could be duplicating.
 *
 * Both operands are required and either can be quietly absent. A skill with no
 * frontmatter `name` never reaches the detector's
 * `catalogue.builtInSkills.find(...)`, and a catalogue that ships no built-ins —
 * Copilot Studio's list is empty — offers nothing to match against. In both
 * cases the comparison did not happen, which is not the same as passing it.
 */
export const BUILT_IN_SKILL_OVERLAP: SkillPackagingPopulation = Object.freeze({
  label: 'declared skill name against the runtime built-ins',
  resolve: (ctx: SkillPackagingContext) => {
    const blocked = runtimePrecondition(ctx);
    if (blocked) return blocked;

    const shipping = selectedCatalogues(ctx.runtimes)
      .filter(catalogue => catalogue.builtInSkills.length > 0);
    if (shipping.length === 0) {
      return noPopulation(
        `None of the selected runtimes (${describeRuntimes(ctx.runtimes)}) publishes a list of `
        + 'the skills it already ships, so there is no built-in for this skill to duplicate.',
      );
    }

    const name = declaredSkillName(skillMarkdown(ctx));
    if (!name) {
      return noPopulation(
        'The SKILL.md frontmatter declares no name field, so there is nothing to compare against '
        + 'the built-in skills a runtime ships. The missing field is reported by PKG-REQ.',
      );
    }

    return populated(
      `The declared name "${name}" was compared against the built-in skills shipped by `
      + `${describeCatalogues(shipping)}.`,
    );
  },
});

// ── Runtime-awareness rules ────────────────────────────────────────────────

export const COWORK_BROWSER_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'medium', family: RUNTIME_RULE_FAMILY,
  population: BROWSERLESS_RUNTIME_SURFACE,
});

export const COWORK_BROWSER: SkillPackagingRuleEntry = skillRuntimeRule({
  id: 'COWORK-BROWSER',
  title: "Browser Tool Is Not in Cowork's Published Tool List",
  pillar: 'portability',
  severity: 'high',
  // Not 'runtime': KNOWN_TAGS is a closed list of cross-cutting concerns, and the
  // runtime dimension is already carried by pillar 'portability'. A 'runtime' tag
  // would re-introduce the platform axis the tag taxonomy deliberately dropped.
  tags: ['quality'],
  // The Cowork platform page lists the tool surface, which is what proves the
  // browser is absent. The package validation rules were cited beside it, but
  // they govern package structure and say nothing about which tools exist.
  references: ['ms-cowork-platform'],
  prose: {
    question: 'Does the skill depend on browser automation on a runtime whose published tool list has none?',
    summary: "Compare the skill's declared tools and prose against the browser-automation surface the runtime publishes.",
    why: 'The current Copilot Cowork tool list does not include browser automation. Because capability lists can change, confirm the dependency and the current runtime surface before treating this as incompatible.',
    fix: 'Reach the same data through a Microsoft 365 tool, an API or a command-line tool.',
    fixSteps: [
      'Identify what the browser step was retrieving or submitting.',
      'Replace it with the equivalent Microsoft 365 tool, API call or CLI command.',
      'If no equivalent exists, state in the description that the skill targets a runtime with browser access.',
    ],
    passWhen: [
      'A selected runtime publishes a tool list with no browser automation, and the skill neither declares a browser tool nor describes driving a browser.',
    ],
    failWhen: [
      'The AI layer confirms the skill depends on browser automation on a runtime whose published tool list does not include it.',
    ],
    notApplicableWhen: [
      'No target runtime was selected, or the bundle has no readable SKILL.md, so there is nothing to judge against a runtime.',
      "Every selected runtime either ships browser tools or publishes no capability surface at all — Copilot Studio's tool access is per-agent configuration, so a missing capability there would be a guess.",
      'Browser automation was mentioned but not confirmed as a dependency. The mention is a candidate the AI layer resolves, not a verdict this rule can reach on its own.',
    ],
  },
  evidence: {
    fieldPaths: ['SKILL.md:frontmatter.allowed-tools', 'SKILL.md:body'],
  },
}, COWORK_BROWSER_OPTIONS);

export const RT_TOOL_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'high', confidence: 'medium', family: RUNTIME_RULE_FAMILY,
  population: DECLARED_TOOLS_AGAINST_CATALOGUE,
});

export const RT_TOOL: SkillPackagingRuleEntry = skillRuntimeRule({
  id: 'RT-TOOL',
  title: 'Skill Names a Tool the Target Runtime Does Not Provide',
  pillar: 'portability',
  severity: 'high',
  // Not 'runtime': KNOWN_TAGS is a closed list of cross-cutting concerns, and the
  // runtime dimension is already carried by pillar 'portability'. A 'runtime' tag
  // would re-introduce the platform axis the tag taxonomy deliberately dropped.
  tags: ['quality'],
  references: ['ms-cowork-platform', 'ms-scout-platform'],
  prose: {
    question: 'Is every tool the skill declares present in the target runtime\u2019s published tool list?',
    summary: "Look up each declared allowed-tool in the tool list the runtime published, and report the ones that are not there.",
    why: 'A step that calls a tool the runtime does not expose fails at that step. The skill has already begun its work, so the result is a partial outcome rather than a clean refusal.',
    fix: "Use a tool the runtime provides, or narrow the skill's stated target runtime.",
    fixSteps: [
      'Check the tool name against those the runtime exposes.',
      'Replace it with the closest available equivalent.',
      'If no equivalent exists, say in the description which runtime the skill targets.',
    ],
    passWhen: [
      'The skill declares at least one tool, a selected runtime publishes a tool list, and every declared tool appears in it.',
    ],
    failWhen: [
      'The AI layer confirms the skill depends on a declared tool that is absent from the published tool list of a runtime it targets.',
    ],
    notApplicableWhen: [
      'No target runtime was selected, or the bundle has no readable SKILL.md, so there is nothing to judge against a runtime.',
      'No selected runtime publishes a tool list; where tool access is per-agent configuration, absence from a list does not mean the runtime lacks the tool.',
      'The frontmatter declares no allowed-tools, so the skill names no tool to look up.',
    ],
  },
  evidence: {
    fieldPaths: ['SKILL.md:frontmatter.allowed-tools', 'SKILL.md:frontmatter.allowed_tools'],
    // The browser-less case is COWORK-BROWSER's to report, and the detector
    // skips it here explicitly so one defect is not published as two findings.
    separatelyOwnedClaims: [
      'A browser tool declared against a runtime that publishes no browser automation, which COWORK-BROWSER owns.',
    ],
  },
}, RT_TOOL_OPTIONS);

export const RT_URL_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', family: RUNTIME_RULE_FAMILY,
  population: WEB_DRIVING_PROSE,
});

export const RT_URL: SkillPackagingRuleEntry = skillRuntimeRule({
  id: 'RT-URL',
  title: 'Skill Drives a Website That Has a Command-Line Tool',
  pillar: 'portability',
  severity: 'medium',
  // Not 'runtime': KNOWN_TAGS is a closed list of cross-cutting concerns, and the
  // runtime dimension is already carried by pillar 'portability'. A 'runtime' tag
  // would re-introduce the platform axis the tag taxonomy deliberately dropped.
  tags: ['quality'],
  // The Scout platform page documents the command-line tools that make the
  // web-driving step unnecessary. The Cowork package validation rules were
  // cited beside it, but they govern package structure, not tool choice.
  references: ['ms-scout-platform'],
  prose: {
    question: 'Does the skill drive a website through a browser when a documented command-line tool does the same work?',
    summary: 'Read the SKILL.md prose for navigation steps against a site whose command-line tool the runtime documents.',
    why: 'Driving a web interface is slower and far more brittle than the equivalent command-line tool, and it breaks whenever the page layout changes.',
    fix: 'Use the documented command-line tool instead.',
    fixSteps: [
      'Replace the navigation step with the equivalent command.',
      "Declare the command in the skill's allowed tools so it is available at run time.",
    ],
    passWhen: [
      'The SKILL.md prose describes no step that drives a website for which a command-line tool is documented.',
    ],
    failWhen: [
      'The AI layer confirms the skill drives a website through a browser where the runtime documents a command-line tool that does the same work.',
    ],
    notApplicableWhen: [
      'No target runtime was selected, or the bundle has no readable SKILL.md, so there is no prose to read.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:body'] },
}, RT_URL_OPTIONS);

export const RT_BUILTIN_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', family: RUNTIME_RULE_FAMILY,
  population: BUILT_IN_SKILL_OVERLAP,
  // DIVERGENCE: pillar 'portability' buckets to dimension 'readiness', but the
  // legacy row for RT-BUILTIN publishes 'quality'. The pillar is pinned by the
  // RT- prefix table and by reviewPipeline.test.ts; the dimension is what the
  // grouped skill view has always shown. Both are preserved.
  legacyDimension: 'quality',
});

// DIVERGENCE: pillar 'portability' derives dimension 'readiness' through
// SKILL_DIMENSION_BUCKET, but the legacy RULE_REGISTRY row publishes
// dimension 'quality'. Phase 2 keeps the published value, so the legacy
// 'quality' is pinned on the projection below while the pillar stays
// 'portability' — which is what artifactReviewService's PREFIX_TO_DIMENSION
// table maps the RT prefix to, and what the other three rules here derive
// from. The two values are: pillar-derived 'readiness' vs legacy 'quality'.
export const RT_BUILTIN: SkillPackagingRuleEntry = skillRuntimeRule({
  id: 'RT-BUILTIN',
  title: 'Skill Re-Implements a Capability the Runtime Already Provides',
  pillar: 'portability',
  severity: 'medium',
  // Not 'runtime': KNOWN_TAGS is a closed list of cross-cutting concerns, and the
  // runtime dimension is already carried by pillar 'portability'. A 'runtime' tag
  // would re-introduce the platform axis the tag taxonomy deliberately dropped.
  tags: ['quality'],
  references: ['ms-cowork-platform', 'ms-scout-platform', 'ms-skill-authoring-rubric'],
  prose: {
    question: 'Does the skill duplicate a capability the target runtime already ships?',
    summary: 'Compare the declared skill name against the built-in skills the runtime publishes.',
    why: 'A skill that duplicates a built-in competes with it for selection. The model may choose either, so behaviour varies between runs for reasons the author cannot see.',
    fix: 'Build on the existing capability rather than replacing it.',
    fixSteps: [
      'Compare the skill against the built-in capability and identify what it genuinely adds.',
      'Narrow the skill to that difference, and have it defer to the built-in for the rest.',
      'Withdraw the skill if it adds nothing the built-in does not already do.',
    ],
    passWhen: [
      'The skill declares a name, a selected runtime publishes its built-in skills, and the name matches none of them.',
    ],
    failWhen: [
      'The AI layer confirms the skill re-implements a capability a runtime it targets already ships.',
    ],
    notApplicableWhen: [
      'No target runtime was selected, or the bundle has no readable SKILL.md, so there is nothing to judge against a runtime.',
      'No selected runtime publishes a list of the skills it ships, so there is no built-in to duplicate.',
      'The frontmatter declares no name field, so there is nothing to compare against the built-in list.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:frontmatter.name'] },
}, RT_BUILTIN_OPTIONS);

/**
 * Every runtime-awareness rule declared here, in published order.
 *
 * The order is the one `RULE_REGISTRY` publishes under its "Group F — runtime
 * awareness" heading, so a reader comparing the two files reads the same four
 * rules in the same sequence.
 *
 * `skillRuleRegistry.ts` will spread {@link skillRuntimeDefinitions} over the
 * rows still written out by hand, exactly as it already does for the scanner
 * rules. That spread is the orchestrator's edit, not this file's.
 */
export const skillRuntimeRuleEntries: readonly SkillPackagingRuleEntry[] = Object.freeze([
  COWORK_BROWSER,
  RT_TOOL,
  RT_URL,
  RT_BUILTIN,
]);

export const skillRuntimeCoreRules: readonly Rule<SkillPackagingContext>[] = Object.freeze(
  skillRuntimeRuleEntries.map(entry => entry.rule),
);

export const skillRuntimeDefinitions: Readonly<Record<string, SkillRuleDefinition>> =
  Object.freeze(
    Object.fromEntries(skillRuntimeRuleEntries.map(entry => [entry.rule.id, entry.definition])),
  );
