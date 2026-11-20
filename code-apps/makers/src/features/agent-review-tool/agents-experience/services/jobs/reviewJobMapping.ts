import type { AgentComponentResult, ReviewJobItemRow } from '../../contracts/ReviewJob';
import { ReviewJobItemStatus } from '../../contracts/ReviewJob';
import { aiRulesForNode } from '../../../review-core/registry';
import type { NodeKind } from '../../../review-core/rule';
import {
  ARC2_NODE_CONTRACT,
  arc2ToAgentComponentResult,
  parseArc2NodeOutput,
  parseBareArc2Result,
} from './aiWorkflowNodeOutput';

/**
 * Reserved child-index namespaces shared by browser and durable hosts.
 * Components occupy 0-999, resources 1000-8999, orchestration 9000 and coverage 9001.
 * All sentinels remain nonnegative for the connector's cached numeric constraints.
 */
export const AGENT_LEVEL_INDEX = { ORCHESTRATION: 9000, INSTRUCTION_COVERAGE: 9001 } as const;
export const RESOURCE_INDEX_BASE = 1000;

/** Legacy unindexed rows remain component rows; resource and agent-level rows do not. */
export function isComponentRow(row: ReviewJobItemRow): boolean {
  const index = row.cat_componentindex;
  return index === undefined || index === null || (index >= 0 && index < RESOURCE_INDEX_BASE);
}

/**
 * Map oldest-first child evidence, retaining the newest usable result for each component.
 *
 * Two payload shapes arrive on this path and they are told apart by contract,
 * not by guesswork. An ARC2 `arc2-node-output-v4` row is converted first,
 * because it carries no `skillName` of its own and would otherwise be discarded
 * by the guard below — which is silent, so the review would simply complete with
 * the AI stage missing rather than report anything. Anything else is read as the
 * legacy shape exactly as before.
 *
 * @param node - Which reviewer produced these rows. It cannot be read off the
 *   row: a component row looks identical whichever skill harness ran, so the
 *   caller supplies it from the job's kind. It decides which rules are named
 *   when a component comes back failed.
 */
export function mapReviewJobItems(
  rows: ReviewJobItemRow[],
  node: NodeKind = 'copilot-skill',
): AgentComponentResult[] {
  const byComponent = new Map<string, AgentComponentResult>();
  for (const row of rows) {
    if (!isComponentRow(row)) continue;
    const parsed = safeParse(row.cat_resultjson ?? '');
    if (!parsed || typeof parsed !== 'object') continue;

    // The workflow writes the node's structured output with no envelope around
    // it, so the bare reader is what matches today; the envelope branch stays
    // for rows written before that change.
    const arc2 = parseArc2NodeOutput(parsed) ?? parseBareArc2Result(parsed, node);
    if (arc2) {
      // The row's own column is the identity here: a v4 payload's `subjectId` is
      // the agent and repeats on every component, so it cannot tell them apart.
      // The failed-row placeholder writes `skillName` as an empty string, which
      // is why this falls through on falsy rather than only on nullish.
      const name = row.cat_skillname || arc2.unitId;
      if (!name) continue;
      byComponent.set(
        keyFor(row, name),
        withFailureState(arc2ToAgentComponentResult(arc2, name), row, node),
      );
      continue;
    }

    // A payload that declares the v4 contract but failed to parse is malformed,
    // not legacy. The legacy branch below reads `findings` behind `Array.isArray`,
    // so letting it through would publish a component with no findings -- which
    // renders as a clean pass for a unit that was never understood.
    if ((parsed as { contract?: unknown }).contract === ARC2_NODE_CONTRACT) continue;

    const candidate = parsed as Partial<AgentComponentResult>;
    const skillName = candidate.skillName || row.cat_skillname;
    if (!skillName) continue;
    byComponent.set(keyFor(row, skillName), withFailureState({
      ...(candidate as AgentComponentResult), skillName, status: candidate.status ?? 'complete',
      dimensions: Array.isArray(candidate.dimensions) ? candidate.dimensions : [],
      findings: Array.isArray(candidate.findings) ? candidate.findings : [],
      summary: candidate.summary ?? '',
    }, row, node));
  }
  return [...byComponent.values()];
}

/**
 * Report a failed component as unassessed rather than as a clean pass.
 *
 * The workflow writes a placeholder result alongside `cat_itemstatus = 2` when a
 * reviewer could not be read. For the component nodes that placeholder names no
 * rules at all, so it parses as a perfectly well-formed result with nothing
 * wrong — a component nobody reviewed renders exactly like one that passed.
 *
 * Naming every rule the node was meant to run withholds them from both sides of
 * the score, which is what an unassessed rule means everywhere else: not a pass,
 * not a failure. The agent-level nodes already enumerate their own rules in this
 * situation, so this gives the per-component loop the same treatment.
 *
 * Only the component branch needs it. A failed Standard row is rejected by its
 * reader before any parser sees it, and the declarative-agent reader has its own
 * status gate.
 */
function withFailureState(
  result: AgentComponentResult,
  row: ReviewJobItemRow,
  node: NodeKind,
): AgentComponentResult {
  if (row.cat_itemstatus !== ReviewJobItemStatus.Failed) return result;

  // `cat_errormessage` is written as an empty string on success, never null, so
  // the default has to fall through on falsy rather than only on nullish.
  const reason = row.cat_errormessage || 'The reviewer did not return a result.';
  return {
    ...result,
    // The placeholder's rule list was empty when the envelope derived its
    // status, so that derivation has to be re-run now the rules are named.
    status: 'partial',
    errorMessage: reason,
    // The flow's own enumeration wins where it exists: it names the rules that
    // node was actually about to run, which is finer than anything derivable
    // here. 🔴 Do not delete those literal rule lists from the workflow on the
    // grounds that the host can synthesise them — the host list is a fallback
    // for the component nodes, which enumerate nothing, not a replacement.
    notAssessed: result.notAssessed?.length
      ? result.notAssessed
      : aiRulesForNode(node).map((rule) => ({
        ruleId: rule.id,
        reason,
        scopeStatus: 'unavailable' as const,
      })),
  };
}

/** Index keys a row when it has one; a legacy unindexed row keys by name. */
function keyFor(row: ReviewJobItemRow, skillName: string): string {
  return row.cat_componentindex === undefined || row.cat_componentindex === null
    ? `name:${skillName}` : `#${row.cat_componentindex}`;
}

/** Missing or unusable child payloads are absent evidence, not successful evaluations. */
export function safeParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}
