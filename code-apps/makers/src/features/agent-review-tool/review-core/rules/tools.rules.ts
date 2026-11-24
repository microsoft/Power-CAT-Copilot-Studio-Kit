/**
 * The Tools pillar — one record and five checks over the captured tool inventory.
 *
 * Every rule here answers its question once per offending tool rather than once
 * per agent, which is why each failing branch returns `failWith` with a row per
 * component instead of a single agent-level verdict. The identity on each row is
 * taken verbatim from the capture (`componentIdUnique`, then `componentId`, then
 * the schema name) because a display name or an array position does not survive a
 * re-capture, and a row the host cannot tie back to a real component is reported
 * as unverifiable rather than silently trusted.
 *
 * Two relocation notes, both deliberate:
 *
 * - **TOL-01's not-applicable reason is new text.** The hand-written rule passed
 *   no reason at all. ART reaches the empty-inventory case through its
 *   `optionalPopulation` short-circuit, which answers before the check is ever
 *   called, so the string below is unreachable in ART and cannot move a byte of
 *   its output. It is written out anyway because `review-core` owes a reason on
 *   every not-applicable, and a host that calls `check` directly deserves one.
 * - **TOL-05's partial-inventory flag is published by the adapter.** A tool with
 *   no connector/operation pair makes the duplicate scope incomplete, and ART
 *   carries that as `CopilotInspection.incomplete`, which `RuleOutcome` does not
 *   model. {@link toolOperationScopeIncomplete} is exported so the adapter can
 *   re-publish it without the predicate being written down twice.
 */

import type {
  AeTool, AeWorkflowTool, AgentsExperienceModel,
} from '../../agents-experience/contracts/AgentsExperienceModel';
import {
  couldNotRun, failWith, notApplicable, pass, record,
  type Rule, type RuleEvidenceRef, type RuleInstance,
} from '../rule';
import { hasWeakDescription } from './tool-descriptions';

const COPILOT = ['copilot'] as const;

/**
 * The identity a captured tool is quoted under.
 *
 * Mirrors ART's `capturedEvidence` preference exactly — unique id, then id, then
 * nothing — so that a whitespace-only id falls through to the next candidate
 * rather than being published as a blank that verifies.
 */
function toolRef(tool: AeTool | AeWorkflowTool, quote: string): RuleEvidenceRef {
  return {
    id: tool.componentIdUnique?.trim() || tool.componentId?.trim() || undefined,
    schemaName: tool.schemaname,
    quote,
  };
}

/** True when a captured tool lacks the connector/operation pair TOL-05 compares on. */
export function toolOperationScopeIncomplete(model: AgentsExperienceModel): boolean {
  return model.tools.some(tool => !tool.connectorId || !tool.operationId);
}

export const TOL_01: Rule<AgentsExperienceModel> = {
  id: 'TOL-01',
  title: 'Tool inventory',
  harnesses: COPILOT,
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Which tools, operations and authentication modes is this agent configured with?',
    summary: 'Record the captured tool types, operations and authentication configuration.',
    why: 'An inventory provides context for the component checks, not a quality score.',
    fix: 'No action required — keep the inventory current.',
    passWhen: ['At least one tool is captured in the agent configuration.'],
    failWhen: [],
    notApplicableWhen: ['No tools are captured in the agent configuration.'],
  },
  evidence: { fieldPaths: ['tools'], populations: ['tools'] },
  check(model) {
    if (model.tools.length === 0) {
      return notApplicable('No tools are captured in the agent configuration.');
    }
    const connector = model.tools.filter(t => t.kind === 'ConnectorTool').length;
    const mcp = model.tools.filter(t => t.kind === 'McpTool').length;
    return record([{
      title: `Tool inventory: ${model.tools.length} tools`,
      detail: `ConnectorTool: ${connector} · McpTool: ${mcp}\n` +
        model.tools.map(t => `${t.name} → ${t.operationId ?? '?'} (${t.authMode ?? '?'})`).join('\n'),
      why: 'The orchestrator selects tools by their name and description; a clear inventory is the basis for the checks below.',
      makerAction: 'No action required — inventory shown for the review record.',
    }]);
  },
};

export const TOL_02: Rule<AgentsExperienceModel> = {
  id: 'TOL-02',
  title: 'Tools have conversational descriptions',
  harnesses: COPILOT,
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Does every captured tool describe, in words, when the agent should call it?',
    summary: 'Inspect each captured tool description for at least two words.',
    why: 'Descriptions explain when and why a tool should be selected.',
    fix: 'Give each tool a conversational description of its purpose and selection conditions.',
    passWhen: ['Every captured tool carries a description of two or more words.'],
    failWhen: ['A captured tool has no description, or one shorter than two words.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['tools.description'], populations: ['tools'] },
  check(model) {
    const weak = model.tools.filter(hasWeakDescription);
    if (weak.length === 0) return pass();
    return failWith(weak.map((t): RuleInstance => ({
      subjectId: t.componentIdUnique,
      subject: t.name,
      subjectRef: toolRef(t, t.description ?? ''),
      title: `Tool "${t.name}" has a weak or missing description`,
      detail: `description: ${t.description ? `"${t.description}"` : 'missing'}`,
      why: 'Well-described tools perform better — the orchestrator relies on the description to decide when to call the tool.',
      makerAction: 'Add a full conversational description of when and why the agent should use this tool.',
    })));
  },
};

const TOL_03_NO_AUTHENTICATION =
  'The agent uses No authentication and every captured tool runs under Invoker (user) authentication; TOL-06 reports that case.';

export const TOL_03: Rule<AgentsExperienceModel> = {
  id: 'TOL-03',
  title: 'Tool authentication is reviewed for user-scoped access',
  harnesses: COPILOT,
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality', 'security'],
  references: ['ms-enduser-auth'],
  prose: {
    question: 'Does every captured tool run under the authentication scope its data access needs?',
    summary: 'Identify captured tools whose authMode is not Invoker.',
    why: 'Authentication choices should match the intended data-access scope; this check does not observe a data leak.',
    fix: 'Confirm authentication is intentional; use user authentication for user-scoped data.',
    passWhen: ['Every captured tool runs under Invoker (user) authentication.'],
    failWhen: ['A captured tool runs under an authentication mode other than Invoker.'],
    notApplicableWhen: [TOL_03_NO_AUTHENTICATION],
  },
  evidence: { fieldPaths: ['tools.authMode'], populations: ['tools'] },
  check(model) {
    const nonInvoker = model.tools.filter(t => (t.authMode ?? '').toLowerCase() !== 'invoker');
    const noSignIn = model.authenticationMode === 1;
    if (nonInvoker.length === 0) return noSignIn ? notApplicable(TOL_03_NO_AUTHENTICATION) : pass();
    return failWith(nonInvoker.map((t): RuleInstance => ({
      subjectId: t.componentIdUnique,
      subject: t.name,
      subjectRef: toolRef(t, t.authMode ?? ''),
      title: `Tool "${t.name}" does not use user authentication`,
      detail: `authMode: ${t.authMode ?? 'unset'}`,
      why: 'Author (maker) credentials are documented for low-risk implicit access only; user authentication is required when data access must be restricted to the invoking user.'
        + (noSignIn ? ' The agent uses No authentication, so users do not sign in.' : ''),
      makerAction: 'Confirm the authentication mode is intentional; use user authentication for tools that reach user-scoped data.',
    })));
  },
};

export const TOL_04: Rule<AgentsExperienceModel> = {
  id: 'TOL-04',
  title: 'Tools declare connection references',
  harnesses: COPILOT,
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  tags: ['quality'],
  references: ['ms-connections'],
  prose: {
    question: 'Does every captured tool declare the connection it authenticates through?',
    summary: 'Inspect the connection reference on each captured tool.',
    why: 'A declared connection is a configuration prerequisite for service authentication, not proof of connection health.',
    fix: 'Configure and attach the required connection reference.',
    passWhen: ['Every captured tool declares a connection reference.'],
    failWhen: ['A captured tool declares no connection reference.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['tools.connectionReference'], populations: ['tools'] },
  check(model) {
    const missing = model.tools.filter(t => !t.connectionReference);
    if (missing.length === 0) return pass();
    return failWith(missing.map((t): RuleInstance => ({
      subjectId: t.componentIdUnique,
      subject: t.name,
      subjectRef: toolRef(t, t.connectionReference ?? ''),
      title: `Tool "${t.name}" has no connection reference`,
      detail: `connectionReference: missing · connector: ${t.connectorId ?? '?'}`,
      why: 'Without a connection the tool cannot authenticate to its service at runtime.',
      makerAction: 'Configure and attach a connection for this tool.',
    })));
  },
};

const TOL_05_PARTIAL_SCOPE =
  'Some captured tools lack a connector/operation pair; the duplicate-operation scope cannot be fully assessed.';

export const TOL_05: Rule<AgentsExperienceModel> = {
  id: 'TOL-05',
  title: 'Tool operations are not duplicated',
  harnesses: COPILOT,
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Do two captured tools call the same connector operation?',
    summary: 'Compare declared connector/operation pairs in the captured inventory.',
    why: 'Duplicate operations can make the authored selection space harder to maintain.',
    fix: 'Remove duplicate tool operations or differentiate their purpose and description.',
    passWhen: ['Every captured connector/operation pair appears on exactly one tool.'],
    failWhen: ['Two or more captured tools declare the same connector and operation.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['tools.connectorId/operationId'], populations: ['tools'] },
  check(model) {
    const seen = new Map<string, string>();
    const instances: RuleInstance[] = [];
    let incomplete = false;
    for (const t of model.tools) {
      if (!t.connectorId || !t.operationId) {
        incomplete = true;
        continue;
      }
      const key = `${t.connectorId}::${t.operationId}`;
      const prev = seen.get(key);
      if (prev) {
        instances.push({
          subjectId: t.componentIdUnique,
          subject: t.name,
          subjectRef: toolRef(t, key),
          title: `Duplicate tool operation: "${prev}" and "${t.name}"`,
          detail: `both call ${key}`,
          why: 'Overlapping tools make orchestrator selection ambiguous.',
          makerAction: 'Remove one of the duplicate tools or differentiate their purpose and description.',
        });
      } else {
        seen.set(key, t.name);
      }
    }
    if (instances.length) return failWith(instances, incomplete ? TOL_05_PARTIAL_SCOPE : '');
    if (incomplete) return couldNotRun(TOL_05_PARTIAL_SCOPE);
    return pass();
  },
};

const TOL_06_NOT_APPLICABLE = 'No captured tool or agent flow runs under Invoker (user) authentication.';
const TOL_06_MODE_UNKNOWN =
  'The agent authentication mode was not captured, so this check cannot tell whether users sign in.';
const TOL_06_WHY =
  'Microsoft Learn: "No authentication means your agent doesn\'t require your users to sign in when interacting with the agent." '
  + 'It also says: "An unauthenticated configuration means your agent can only access public information and resources." '
  + 'A tool that runs under Invoker authentication uses the credentials of the signed-in user. '
  + 'This check reads the configuration only; the review did not test how such a tool behaves at runtime.';
const TOL_06_ACTION =
  'Configure user authentication for the agent so that users sign in. If the agent must stay unauthenticated, confirm that it needs this tool.';

export const TOL_06: Rule<AgentsExperienceModel> = {
  id: 'TOL-06',
  title: 'Tools that need user sign-in run in an agent that signs users in',
  harnesses: COPILOT,
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  tags: ['quality', 'security'],
  references: ['ms-agent-auth', 'ms-enduser-auth'],
  prose: {
    question: 'Does the agent sign users in when a captured tool or agent flow needs user sign-in?',
    summary: 'Compare the agent authentication mode with the tools and agent flows that run under Invoker (user) authentication.',
    why: TOL_06_WHY,
    fix: TOL_06_ACTION,
    passWhen: ['The agent signs users in: its authentication mode is Microsoft Entra ID, Microsoft Entra ID (custom), or Generic OAuth2.'],
    failWhen: ['The agent uses No authentication and a captured tool or agent flow runs under Invoker (user) authentication.'],
    notApplicableWhen: [TOL_06_NOT_APPLICABLE],
  },
  evidence: { fieldPaths: ['authenticationMode'], populations: ['tools', 'configuration'] },
  check(model) {
    const invokerTools = model.tools.filter(t => (t.authMode ?? '').toLowerCase() === 'invoker');
    const invokerFlows = (model.workflowTools ?? []).filter(w => (w.connectionMode ?? '').toLowerCase() === 'invoker');
    if (invokerTools.length === 0 && invokerFlows.length === 0) return notApplicable(TOL_06_NOT_APPLICABLE);
    if (model.authenticationMode === undefined || model.authenticationMode === 0) return couldNotRun(TOL_06_MODE_UNKNOWN);
    if (model.authenticationMode !== 1) return pass();
    return failWith([
      ...invokerTools.map((t): RuleInstance => ({
        subjectId: t.componentIdUnique,
        subject: t.name,
        subjectRef: { ...toolRef(t, t.authMode ?? ''), fieldPath: 'tools.authMode' },
        title: `Tool "${t.name}" needs user sign-in, but the agent uses No authentication`,
        detail: `authMode: ${t.authMode ?? ''} · agent authentication: No authentication`,
        why: TOL_06_WHY,
        makerAction: TOL_06_ACTION,
      })),
      ...invokerFlows.map((w): RuleInstance => ({
        subjectId: w.componentIdUnique,
        subject: w.name,
        subjectRef: { ...toolRef(w, w.connectionMode ?? ''), fieldPath: 'workflowTools.connectionMode' },
        title: `Tool "${w.name}" needs user sign-in, but the agent uses No authentication`,
        detail: `connectionMode: ${w.connectionMode ?? ''} · agent authentication: No authentication`,
        why: TOL_06_WHY,
        makerAction: TOL_06_ACTION,
      })),
    ]);
  },
};

export const toolRules: readonly Rule<AgentsExperienceModel>[] = Object.freeze([
  TOL_01, TOL_02, TOL_03, TOL_04, TOL_05, TOL_06,
]);
