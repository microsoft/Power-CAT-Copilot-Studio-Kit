/**
 * One definition of "can the orchestrator choose this tool by reading its description?",
 * shared by the copilot and standard harnesses.
 *
 * The two harnesses cannot share a *rule*: copilot executes `check(model)` over an
 * `AgentsExperienceModel` (`GroundedRuleEngine.ts:33`), while standard scores — and renders —
 * off the `LocalPattern` a rule emits from `ParsedBotData` (`localPatternBuilder.ts:14`), and
 * `runRules` is never called on the standard path. So `TOL-02` and `local-pattern-12` are two
 * declarations of the same judgement by necessity.
 *
 * They are not two *predicates*. Everything that decides an outcome lives here, so the answer
 * cannot drift between harnesses the way a copy-pasted filter would. Both rule files import it;
 * this file imports nothing, so neither harness depends on the other.
 */

/** The shape both harnesses can supply: copilot's `AeTool` and standard's `ToolDetail`. */
export interface DescribedTool {
  description?: string;
}

/** Words in a configured description, treating whitespace-only text as absent. */
export function describedWordCount(value: string | undefined): number {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * A description the model cannot route on: absent, blank, or a single word.
 *
 * One word is the bar because a lone word restates the tool's own name and adds no selection
 * criterion. It is deliberately low — this is the deterministic floor beneath the AI rule that
 * judges whether a description draws a real routing *boundary*, not a substitute for it.
 */
export function hasWeakDescription(tool: DescribedTool): boolean {
  return describedWordCount(tool.description) < 2;
}

/** Compare descriptions the way the model reads them: case- and whitespace-insensitive. */
export function normalizeDescription(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Tools grouped by identical description, returning only the groups that collide.
 *
 * Weakly-described tools are excluded rather than grouped: two tools that are both blank do
 * collide, but `hasWeakDescription` already owns that defect and reporting it twice would charge
 * one authoring mistake against two rules.
 */
export function duplicateDescriptionGroups<T extends DescribedTool>(tools: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const tool of tools) {
    if (hasWeakDescription(tool)) continue;
    const key = normalizeDescription(tool.description);
    groups.set(key, [...(groups.get(key) ?? []), tool]);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
