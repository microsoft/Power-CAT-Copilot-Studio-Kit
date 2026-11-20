/**
 * The Knowledge pillar — eight rules about what an agent can ground an answer in.
 *
 * Of KNW-01 to KNW-04, two are records: the knowledge inventory and the memory
 * setting state what was configured rather than judging it, because neither is
 * a measured answer-quality result. The other two are checks with opposite
 * shapes — KNW-02 reads the instructions and asks whether a promise made there
 * has a source behind it, and KNW-03 reads the tool inventory and asks whether
 * a legacy Work IQ connector is used in place of Work IQ.
 *
 * The wording, severities and references below are the ones ART has published
 * since spec 013 and are reproduced verbatim, with one exception: KNW-03 was
 * rewritten when Microsoft Learn documented Work IQ as generally available
 * (checked 13 Nov 2026). It no longer treats Work IQ as a preview feature.
 *
 * WIQ-01 to WIQ-04 read the Work IQ workloads (`IQCapability` components).
 * WIQ-01 records each workload. WIQ-02 records the default workload scope, and
 * WIQ-03 records each workload with write access. Microsoft Learn documents
 * both as defaults, so they are records, not checks. WIQ-04 fails each preview
 * workload, because preview features are not meant for production use.
 * WIQ-02 to WIQ-04 apply only when the agent also uses the Work IQ tool.
 */

import type {
  AeIqCapability, AeTool, AgentsExperienceModel,
} from '../../agents-experience/contracts/AgentsExperienceModel';
import { norm } from '../../agents-experience/services/rules/ruleTypes';
import {
  couldNotRun, failWith, notApplicable, pass, record, rule,
  type Rule, type RuleEvidenceRef, type RuleInstance,
} from '../rule';

const COPILOT = ['copilot'] as const;

/** Detects a knowledge promise in instruction text, independent of any source inventory. */
const KNOWLEDGE_PROMISE = /\bknowledge base\b|\bdocumentation\b|\bour docs\b|\bknowledge sources?\b/;

/** Connector API names of the legacy app-specific Work IQ tools. See `legacyWorkIqTools`. */
const LEGACY_WORK_IQ_CONNECTORS: ReadonlySet<string> = new Set([
  'shared_a365copilotchatmcp', // Copilot (and Search, assumed)
  'shared_a365outlookcalendarmcp', // Calendar
  'shared_a365outlookmailmcp', // Mail
  'shared_workiqsharepoint', // SharePoint
  'shared_workiqonedrive', // OneDrive
  'shared_a365teamsmcp', // Teams
  'shared_a365memcp', // User
  'shared_a365wordmcp', // Word
]);

/** Lowercased last path segment of a connector ID: `/providers/Microsoft.PowerApps/apis/shared_x` gives `shared_x`. */
function connectorApiName(connectorId: string | undefined): string {
  return (connectorId ?? '').trim().split('/').filter(Boolean).pop()?.toLowerCase() ?? '';
}

/**
 * Tools that use a legacy app-specific Work IQ connector.
 *
 * Microsoft Learn, "Understand MCP server options in Agent 365"
 * (https://learn.microsoft.com/microsoft-agent-365/tooling-servers-overview),
 * names the legacy tools: Copilot, Calendar, Mail, SharePoint, OneDrive, Teams,
 * User and Word. They are "only intended for backward compatibility". Learn does
 * not give their connector IDs. The IDs in `LEGACY_WORK_IQ_CONNECTORS` come from
 * the Power Platform connector catalog (checked 16 Nov 2026).
 *
 * The text `a365` alone is not a safe signal. The SharePoint and OneDrive IDs do
 * not contain it. The Microsoft 365 Admin Center MCP (`shared_a365adminmcp`) and
 * Microsoft MCP Servers (`shared_a365mcpservers`) IDs contain it, but they are
 * not Work IQ tools.
 *
 * The Copilot Studio Work IQ page also names a Search tool. The catalog has no
 * separate Search connector, and it describes `shared_a365copilotchatmcp` as
 * "Microsoft Copilot Search operations". Thus this list assumes that Search is
 * the Copilot tool.
 *
 * The match compares the last path segment of the captured connector ID,
 * case-insensitive, so `shared_x` and `/providers/Microsoft.PowerApps/apis/shared_x`
 * both match. Check the list again when Microsoft changes the legacy tools.
 */
export function legacyWorkIqTools(model: AgentsExperienceModel): readonly AeTool[] {
  return model.tools.filter(t => LEGACY_WORK_IQ_CONNECTORS.has(connectorApiName(t.connectorId)));
}

/** Tools that use the generally available Work IQ connector. */
export function workIqMcpTools(model: AgentsExperienceModel): readonly AeTool[] {
  return model.tools.filter(t => /shared_workiqmcp$/i.test(t.connectorId ?? ''));
}

/**
 * Work IQ workload keys, as captured in the `capability` field of an
 * `IQCapability` component. Microsoft Learn lists the workloads by display
 * name only. The keys come from components captured in a test environment.
 */
const GA_WORKLOADS: readonly string[] = ['sites', 'files', 'mail', 'teams', 'calendar', 'people'];
const PREVIEW_WORKLOADS: readonly string[] = ['businessapps'];

/** Display names from the Microsoft Learn page "Work IQ in Copilot Studio (Microsoft Copilot)". */
const WORKLOAD_LABELS: Readonly<Partial<Record<string, string>>> = {
  sites: 'SharePoint',
  files: 'OneDrive',
  mail: 'Outlook mail',
  teams: 'Teams',
  calendar: 'Calendar',
  people: 'People',
  businessapps: 'Business apps (preview)',
};

const NO_IQ_CAPABILITY = 'No Work IQ capability is captured.';
const NO_WORK_IQ_TOOL = 'The agent has Work IQ capabilities, but no Work IQ tool is captured.';
const WRITE_DEFAULT_WHY = 'Write operations are on by default. Your organization\'s permissions and policies still apply.';
const PREVIEW_WHY = 'Preview features aren\'t meant for production use and might have restricted functionality.';

function workloadKey(c: AeIqCapability): string {
  return (c.capability ?? '').trim().toLowerCase();
}

function workloadLabel(c: AeIqCapability): string {
  return WORKLOAD_LABELS[workloadKey(c)] ?? (c.capability?.trim() || 'Unknown workload');
}

function workloadDetail(c: AeIqCapability): string {
  return `capability: ${c.capability ?? 'unset'}; access: ${c.access ?? 'unset'}`;
}

function iqRef(c: AeIqCapability, quote: string): RuleEvidenceRef {
  return {
    id: c.componentIdUnique?.trim() || c.componentId?.trim() || undefined,
    schemaName: c.schemaname,
    quote,
  };
}

/**
 * The capabilities that WIQ-02 to WIQ-04 judge, or the reason why the rules
 * do not apply. WIQ-01 alone shows a capability without the Work IQ tool.
 */
function judgedCapabilities(model: AgentsExperienceModel): readonly AeIqCapability[] | string {
  const capabilities = model.iqCapabilities ?? [];
  if (capabilities.length === 0) return NO_IQ_CAPABILITY;
  if (workIqMcpTools(model).length === 0) return NO_WORK_IQ_TOOL;
  return capabilities;
}

export const KNW_01: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'KNW-01',
  title: 'Knowledge inventory',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'What can this agent ground an answer in — which knowledge sources, and is web search on?',
    summary: 'Record captured knowledge sources and the web-search setting.',
    why: 'Knowledge configuration provides context for grounding, not a measured answer-quality score.',
    fix: 'No action required — keep the knowledge inventory current.',
    passWhen: [
      'At least one knowledge source is captured.',
      'The web-search setting is explicitly configured.',
    ],
    failWhen: [],
    notApplicableWhen: ['No knowledge sources and no explicit web-search setting are configured.'],
  },
  tags: ['quality', 'token-optimizer'],
  references: ['ms-knowledge-add'],
  evidence: {
    fieldPaths: ['knowledge/agentSettings.enableWebSearch'],
    populations: ['knowledge', 'configuration'],
  },
  check(model) {
    if (model.knowledge.length === 0 && model.agentSettings.enableWebSearch === undefined) {
      return notApplicable('No knowledge sources or explicit web-search setting are configured.');
    }
    return record([{
      title: `Knowledge inventory: ${model.knowledge.length} sources`,
      detail: [...model.knowledge.map(k => `${k.name} (${k.sourceKind ?? '?'})`),
        `webSearch: ${model.agentSettings.enableWebSearch ?? 'unknown'}`].join('\n'),
      why: 'Knowledge sources define what the agent can reference when answering.',
      makerAction: 'No action required — inventory shown for the review record.',
    }]);
  },
});

export const KNW_02: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'KNW-02',
  title: 'Instruction knowledge promises have a configured source',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  prose: {
    question: 'Where the instructions promise knowledge, is there a source or web search behind it?',
    summary: 'Compare detected knowledge promises with the source inventory and web-search setting.',
    why: 'Knowledge promises should have a configured grounding source.',
    fix: 'Add the source, enable appropriate web search or remove the unsupported promise.',
    passWhen: [
      'At least one knowledge source is captured.',
      'Web search is explicitly enabled.',
    ],
    failWhen: [
      'The instructions promise knowledge while no source is configured and web search is not enabled.',
    ],
    notApplicableWhen: ['No knowledge promise matches the base detector.'],
    failTitle: 'Instructions promise knowledge the agent does not have',
  },
  tags: ['quality'],
  references: ['ms-knowledge-add'],
  evidence: {
    fieldPaths: ['agentSettings.instructions/knowledge/agentSettings.enableWebSearch'],
    populations: ['instructions', 'knowledge', 'configuration'],
    completeForFailure: ['knowledge', 'configuration'],
  },
  check(model) {
    const text = norm(model.agentSettings.instructions);
    const promises = KNOWLEDGE_PROMISE.test(text);
    const hasKnowledge = model.knowledge.length > 0 || model.agentSettings.enableWebSearch === true;
    if (!promises) return notApplicable('No knowledge promise matches the base detector.');
    if (hasKnowledge) return pass();
    if (model.agentSettings.enableWebSearch === undefined) {
      return couldNotRun('The web-search setting was not captured; a missing grounding source cannot be established.');
    }
    return failWith([{
      title: 'Instructions promise knowledge the agent does not have',
      detail: `instructions reference knowledge; configured sources: 0; web search: ${model.agentSettings.enableWebSearch ?? false}`,
      why: 'The agent cannot answer from a knowledge base it is not connected to.',
      makerAction: 'Add the knowledge source, enable web search, or remove the promise from the instructions.',
    }]);
  },
});

export const KNW_03: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'KNW-03',
  title: 'Work IQ uses the generally available experience',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  prose: {
    question: 'Does this agent use Work IQ instead of the legacy Work IQ tools?',
    summary: 'Identify captured tools that use a legacy Work IQ connector, and confirm that Work IQ or a Work IQ capability is configured.',
    why: 'Work IQ is generally available in Microsoft Copilot Studio and is added by default to every new agent that uses the Microsoft Copilot harness. The legacy Work IQ tools are part of a legacy experience.',
    fix: 'Add Work IQ to the agent and remove the legacy Work IQ tools.',
    passWhen: ['The agent uses the Work IQ tool or has a Work IQ capability, and no captured tool uses a legacy Work IQ connector.'],
    failWhen: ['At least one captured tool uses a legacy Work IQ connector.'],
    notApplicableWhen: ['No Work IQ tool, legacy Work IQ tool, or Work IQ capability is captured.'],
    failTitle: 'Legacy Work IQ tools in use',
  },
  tags: ['quality', 'token-optimizer'],
  references: ['ms-work-iq'],
  evidence: { fieldPaths: ['tools.connectorId', 'iqCapabilities.capability'], populations: ['tools'] },
  check(model) {
    const legacy = legacyWorkIqTools(model);
    if (legacy.length > 0) {
      return failWith(legacy.map((t): RuleInstance => ({
        subjectId: t.componentIdUnique,
        subject: t.name,
        subjectRef: {
          id: t.componentIdUnique?.trim() || t.componentId?.trim() || undefined,
          schemaName: t.schemaname,
          quote: t.connectorId,
        },
        title: `Tool "${t.name}" uses a legacy Work IQ connector`,
        detail: `${t.name} → ${t.connectorId}`,
        why: 'This connector belongs to the legacy Work IQ tools. Microsoft Learn says that these tools are "part of a legacy experience": "Don\'t select them in place of Work IQ when you configure the new experience."',
        makerAction: 'Add Work IQ to the agent, and then remove this legacy tool.',
      })));
    }
    if (workIqMcpTools(model).length > 0 || (model.iqCapabilities ?? []).length > 0) return pass();
    return notApplicable('No Work IQ tool, legacy Work IQ tool, or Work IQ capability is captured.');
  },
});

export const KNW_04: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'KNW-04',
  title: 'Memory configuration',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'Is memory explicitly enabled on this agent?',
    summary: 'Record whether memory is explicitly enabled.',
    why: 'Memory settings provide data-handling context, not a quality-score contribution.',
    fix: 'Confirm enabled memory fits the intended data-handling requirements.',
    passWhen: ['Memory is explicitly enabled.'],
    failWhen: [],
    notApplicableWhen: ['Memory is not explicitly enabled.'],
  },
  tags: ['quality', 'security', 'token-optimizer'],
  references: ['ms-memory'],
  evidence: { fieldPaths: ['agentSettings.enableMemory'], populations: ['configuration'] },
  check(model) {
    if (model.agentSettings.enableMemory !== true) {
      return notApplicable('Memory is not explicitly enabled.');
    }
    return record([{
      title: 'Memory is enabled',
      detail: 'agentSettings.enableMemory: true',
      why: 'Memory persists user preferences per user across sessions.',
      makerAction: 'Confirm memory\'s per-user persistence fits your data-handling requirements.',
    }]);
  },
});

export const WIQ_01: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'WIQ-01',
  title: 'Work IQ workloads',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'Which Work IQ workloads are configured for this agent?',
    summary: 'List each captured Work IQ capability with its workload and its access.',
    why: 'This record shows the Work IQ workloads that are configured for the agent, and the access of each workload.',
    fix: 'No action is required. Use the list to confirm the workloads that the agent needs.',
    passWhen: ['At least one Work IQ capability is captured. Each capability is shown as a record row.'],
    failWhen: [],
    notApplicableWhen: [NO_IQ_CAPABILITY],
  },
  tags: ['quality', 'scope'],
  references: ['ms-work-iq'],
  evidence: { fieldPaths: ['iqCapabilities.capability'], populations: ['knowledge'] },
  check(model) {
    const capabilities = model.iqCapabilities ?? [];
    if (capabilities.length === 0) return notApplicable(NO_IQ_CAPABILITY);
    return record(capabilities.map((c): RuleInstance => ({
      subjectId: c.componentIdUnique,
      subject: c.name,
      subjectRef: iqRef(c, c.capability ?? ''),
      title: `Work IQ workload: ${workloadLabel(c)}`,
      detail: workloadDetail(c),
      makerAction: 'No action required — inventory shown for the review record.',
    })));
  },
});

export const WIQ_02: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'WIQ-02',
  title: 'Work IQ default workload scope',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'Does this agent keep every Work IQ workload that is selected by default?',
    summary: 'Record when all 6 generally available Work IQ workloads are selected.',
    why: 'All available workloads are selected by default. Microsoft Learn says: "Clear the workloads your agent doesn\'t need to focus it on your scenario."',
    fix: 'Keep only the workloads your agent needs, such as SharePoint, Outlook mail, or Teams, to fit your scenario.',
    passWhen: ['At least one generally available Work IQ workload is cleared.'],
    failWhen: [],
    notApplicableWhen: [NO_IQ_CAPABILITY, NO_WORK_IQ_TOOL],
  },
  tags: ['quality', 'scope', 'privacy'],
  references: ['ms-work-iq'],
  evidence: { fieldPaths: ['iqCapabilities.capability'], populations: ['knowledge'] },
  check(model) {
    const judged = judgedCapabilities(model);
    if (typeof judged === 'string') return notApplicable(judged);
    const selected = new Set(judged.map(workloadKey));
    if (!GA_WORKLOADS.every(key => selected.has(key))) return pass();
    return record([{
      title: 'All generally available Work IQ workloads are selected',
      detail: `Selected workloads: ${GA_WORKLOADS.map(key => WORKLOAD_LABELS[key] ?? key).join(', ')}`,
      why: 'All available workloads are selected by default. Microsoft Learn says: "Clear the workloads your agent doesn\'t need to focus it on your scenario."',
      makerAction: 'Keep only the workloads your agent needs, such as SharePoint, Outlook mail, or Teams, to fit your scenario.',
    }]);
  },
});

export const WIQ_03: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'WIQ-03',
  title: 'Work IQ write access',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'info',
  prose: {
    question: 'Which Work IQ workloads can this agent use for write operations?',
    summary: 'Record each captured Work IQ workload with write access.',
    why: WRITE_DEFAULT_WHY,
    fix: 'Confirm that the agent needs write operations in each listed workload. Clear a workload if the agent doesn\'t need it.',
    passWhen: ['No captured Work IQ workload has write access.'],
    failWhen: [],
    notApplicableWhen: [NO_IQ_CAPABILITY, NO_WORK_IQ_TOOL],
  },
  tags: ['quality', 'security', 'privacy'],
  references: ['ms-work-iq'],
  evidence: { fieldPaths: ['iqCapabilities.access'], populations: ['knowledge'] },
  check(model) {
    const judged = judgedCapabilities(model);
    if (typeof judged === 'string') return notApplicable(judged);
    const write = judged.filter(c => (c.access ?? '').trim().toLowerCase() === 'write');
    if (write.length === 0) return pass();
    return record(write.map((c): RuleInstance => ({
      subjectId: c.componentIdUnique,
      subject: c.name,
      subjectRef: iqRef(c, c.access ?? ''),
      title: `Work IQ workload "${workloadLabel(c)}" has write access`,
      detail: workloadDetail(c),
      why: WRITE_DEFAULT_WHY,
      makerAction: 'Confirm that the agent needs write operations in this workload. Clear the workload if the agent doesn\'t need it.',
    })));
  },
});

export const WIQ_04: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'WIQ-04',
  title: 'Work IQ uses generally available workloads only',
  harnesses: COPILOT,
  pillar: 'knowledge',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  prose: {
    question: 'Does this agent use a Work IQ workload that is in preview?',
    summary: 'Identify captured Work IQ capabilities whose workload is in preview, such as Business apps (preview).',
    why: PREVIEW_WHY,
    fix: 'Clear the preview workloads, or turn off Enable preview workloads in Settings > Work IQ, before you use the agent in production.',
    passWhen: ['Every captured Work IQ workload is generally available.'],
    failWhen: ['At least one captured Work IQ workload is in preview.'],
    notApplicableWhen: [NO_IQ_CAPABILITY, NO_WORK_IQ_TOOL],
    failTitle: 'Work IQ preview workloads in use',
  },
  tags: ['quality'],
  references: ['ms-work-iq'],
  evidence: { fieldPaths: ['iqCapabilities.capability'], populations: ['knowledge'] },
  check(model) {
    const judged = judgedCapabilities(model);
    if (typeof judged === 'string') return notApplicable(judged);
    const preview = judged.filter(c => PREVIEW_WORKLOADS.includes(workloadKey(c)));
    if (preview.length === 0) return pass();
    return failWith(preview.map((c): RuleInstance => ({
      subjectId: c.componentIdUnique,
      subject: c.name,
      subjectRef: iqRef(c, c.capability ?? ''),
      title: `Work IQ workload "${workloadLabel(c)}" is in preview`,
      detail: workloadDetail(c),
      why: PREVIEW_WHY,
      makerAction: 'Clear this workload, or turn off Enable preview workloads in Settings > Work IQ, before you use the agent in production.',
    })));
  },
});

export const knowledgeRules: readonly Rule<AgentsExperienceModel>[] = Object.freeze([
  KNW_01, KNW_02, KNW_03, KNW_04, WIQ_01, WIQ_02, WIQ_03, WIQ_04,
]);
