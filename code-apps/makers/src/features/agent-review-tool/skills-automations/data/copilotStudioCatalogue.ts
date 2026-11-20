/**
 * Copilot Studio capability snapshot (spec 018).
 *
 * Copilot Studio publishes no tool list, and it never will: tools there are
 * per-agent configuration — connectors, APIs and MCP servers added to one
 * agent — rather than a fixed platform surface. `tools` is therefore empty on
 * purpose, and inventing entries for it would be fabrication.
 *
 * That is not the same as having nothing to check. Copilot Studio publishes a
 * **skill package contract** instead, and every rule below is quoted from it:
 *
 * - "A `SKILL.md` file containing YAML front matter (name, description) and
 *   Markdown instructions."
 *   https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-overview
 * - "Use only lowercase letters, numbers, and hyphens. Don't start or end the
 *   name with a hyphen."
 *   https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-create
 *
 * Scout publishes no exact slug contract. Cowork and Copilot Studio do, so
 * both reject edge and consecutive hyphens rather than inheriting a global
 * assumption.
 */
import type { PlatformCatalogue } from '../contracts/PlatformCatalogue';

export const COPILOT_STUDIO_CATALOGUE_VERSION = '2026-08-10';

const SKILLS_OVERVIEW_URL =
  'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/skills-overview';

export const copilotStudioCatalogue: PlatformCatalogue = {
  runtime: 'copilot-studio',
  version: COPILOT_STUDIO_CATALOGUE_VERSION,
  snapshotDate: '2026-08-10',
  // Empty on purpose: tool availability is per-agent configuration, not a fixed
  // platform surface. Claiming a tool is unavailable here would be a guess.
  tools: [],
  builtInSkills: [],
  // No published tool surface, so browser support is not knowable here.
  // `false` would make the Cowork browser rule fire and push the verdict to
  // "will not run" on a runtime where the tool may well be configured.
  supportsBrowserAutomation: 'unknown',
  namePattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  namePatternLabel:
    'lowercase letters or digits separated by single hyphens, with no leading or trailing hyphen',
  /*
    The published package contract. This is what replaced "Not evaluated": a
    Copilot Studio verdict is decided against the format the product documents,
    not against a tool list that does not exist.

    `description` is required rather than merely advised, because it is what the
    orchestration runtime matches a user's request against — "Well-written skill
    descriptions help the orchestrator invoke the right skill at the right
    time." A skill with no description loads and is then never invoked, which is
    a compatibility failure even though nothing is malformed.
  */
  skillContract: {
    entryFile: 'SKILL.md',
    requiredFrontmatter: ['name', 'description'],
    label: 'the skill package format Copilot Studio publishes',
    docsUrl: SKILLS_OVERVIEW_URL,
  },
};
