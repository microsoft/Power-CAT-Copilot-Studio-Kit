/**
 * Fail-open parser for Microsoft Copilot agents (spec 013 §3, §8):
 * never throws, never drops a component; unknown kinds are inventoried
 * with a warning instead of being reviewed.
 */
import { load } from 'js-yaml';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { GRADERS_REQUIRING_CONFIG } from './graders';
import { isRecognisedUnreviewedKind } from './recognisedSystemKinds';
import type {
  AgentsExperienceModel, AeUnknownKind, AeTool, AeSkill, AeConnectedAgent,
  AeKnowledgeSource, AeEvaluationSet, AeTestCase, AeGrader,
  AeIqCapability, AeWorkflowTool, AeAgentHook,
} from '../contracts/AgentsExperienceModel';

const emptyModel = (): AgentsExperienceModel => ({
  agentSettings: { instructions: '', raw: {} },
  tools: [], skills: [], connectedAgents: [], knowledge: [],
  evaluationSets: [], testCases: [], multiTurnCases: [], triggers: [], unknownKinds: [],
});

/** Split an Anthropic-style SKILL.md into frontmatter fields + body. */
export function splitSkillMarkdown(markdown: string): { name?: string; description?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown.trim());
  if (!match) return { body: markdown };
  try {
    const fm = load(match[1]) as Record<string, string> | undefined;
    return { name: fm?.name, description: fm?.description, body: match[2] ?? '' };
  } catch {
    return { body: match[2] ?? markdown };
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const obj = (v: unknown): Record<string, unknown> | undefined =>
  (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined);

function parseInstructions(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return '';

  const instructions = value as Record<string, unknown>;
  if (typeof instructions['value'] === 'string') {
    return instructions['value'];
  }

  const segments = instructions['segments'];
  if (!Array.isArray(segments)) return '';

  return segments
    .map(segment =>
      typeof segment === 'object' &&
      segment !== null &&
      typeof (segment as Record<string, unknown>)['value'] === 'string'
        ? (segment as Record<string, unknown>)['value'] as string
        : '',
    )
    .filter(Boolean)
    .join('\n');
}

function mapTool(c: BotComponent, doc: Record<string, unknown>, kind: 'ConnectorTool' | 'McpTool'): AeTool {
  return {
    name: str(doc['displayName']) ?? c.name, displayName: str(doc['displayName']),
    // The designer writes the description to the component column; only some
    // component shapes carry it in the YAML. Preferring the YAML keeps any
    // authored override winning, with the column as the real source.
    description: str(doc['description']) ?? str(c.description), kind,
    authMode: str(doc['authMode']), connectionReference: str(doc['connectionReference']),
    connectorId: str(doc['connectorId']), operationId: str(doc['operationId']),
    schemaname: c.schemaname,
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

function mapIqCapability(c: BotComponent, doc: Record<string, unknown>): AeIqCapability {
  return {
    name: c.name, schemaname: c.schemaname,
    capability: str(doc['capability']), access: str(doc['access']),
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

function mapWorkflowTool(c: BotComponent, doc: Record<string, unknown>): AeWorkflowTool {
  return {
    name: str(doc['displayName']) ?? c.name, displayName: str(doc['displayName']),
    description: str(doc['description']) ?? str(c.description),
    schemaname: c.schemaname,
    workflowId: str(doc['workflowId']),
    connectionMode: str(obj(doc['connectionProperties'])?.['mode']),
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

function mapAgentHook(c: BotComponent, doc: Record<string, unknown>): AeAgentHook {
  const action = obj(doc['action']);
  return {
    name: c.name, schemaname: c.schemaname,
    event: str(obj(doc['event'])?.['kind']),
    action: str(action?.['kind']),
    workflowId: str(action?.['workflowId']),
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

const BUNDLE_MARKER_RE = /<!--\s*bic:bundle=([^>]+)\s*-->/;

function mapSkill(c: BotComponent, doc: Record<string, unknown>): AeSkill {
  const rawContent = str(doc['content']) ?? '';
  const bundleMarkerMatch = BUNDLE_MARKER_RE.exec(rawContent);
  const bundleMarker = bundleMarkerMatch?.[1]?.trim();

  if (bundleMarker) {
    return {
      name: c.name,
      schemaname: c.schemaname,
      markdown: rawContent,
      body: '',
      componentId: c.botcomponentid,
      componentIdUnique: c.componentidunique,
      source: 'zip-bundle',
      bundleMarker,
      resourceCount: 0,
    };
  }

  const fm = splitSkillMarkdown(rawContent);
  return {
    name: fm.name ?? c.name,
    schemaname: c.schemaname,
    markdown: rawContent,
    frontmatterName: fm.name,
    frontmatterDescription: fm.description,
    body: fm.body,
    componentId: c.botcomponentid,
    componentIdUnique: c.componentidunique,
    source: 'inline-markdown',
    resourceCount: 0,
  };
}

function mapConnected(c: BotComponent, doc: Record<string, unknown>): AeConnectedAgent {
  return {
    name: str(doc['displayName']) ?? c.name, displayName: str(doc['displayName']),
    // Same as tools: the delegation description lives in the component column.
    description: str(doc['description']) ?? str(c.description),
    botSchemaName: str(doc['botSchemaName']),
    historyTypeKind: str((doc['historyType'] as Record<string, unknown> | undefined)?.['kind']),
    schemaname: c.schemaname,
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

function mapKnowledge(c: BotComponent, doc: Record<string, unknown>): AeKnowledgeSource {
  const source = doc['source'];
  const sourceKind = typeof source === 'object' && source !== null
    ? str((source as Record<string, unknown>)['kind'])
    : str(source);
  return {
    name: c.name, sourceKind, schemaname: c.schemaname,
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

function mapUploadedFileKnowledge(c: BotComponent): AeKnowledgeSource {
  return {
    name: c.filedata_name ?? c.name,
    sourceKind: 'UploadedFile',
    schemaname: c.schemaname,
    componentId: c.botcomponentid,
    componentIdUnique: c.componentidunique,
  };
}

/**
 * Grader kinds that are inert without maker-supplied configuration: a
 * ToolCallGrader with no target tool, a ContainsAnyGrader with no keywords or a
 * PromptGrader with no instructions returns "Invalid" on every row.
 */
function mapGrader(g: unknown): AeGrader {
  if (typeof g !== 'object' || g === null) return { kind: String(g), configured: true };
  const o = g as Record<string, unknown>;
  const kind = String(o['kind'] ?? 'Unknown');
  const threshold = typeof o['threshold'] === 'number' ? o['threshold'] : undefined;
  // A grader carrying only `kind` has no target, keywords or instructions to grade against.
  const configured = !GRADERS_REQUIRING_CONFIG.has(kind) || Object.keys(o).length > 1;
  const labels = Array.isArray(o['labels'])
    ? (o['labels'] as unknown[])
      .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
      .map((l) => ({ name: str(l['name']) ?? '', description: str(l['description']), outcome: str(l['outcome']) }))
      .filter((l) => l.name.length > 0)
    : undefined;
  return {
    kind, name: str(o['name']), threshold, configured,
    instructions: str(o['instructions']),
    labels: labels && labels.length > 0 ? labels : undefined,
  };
}

/**
 * Fields both case kinds may carry. `expectedExecutionSteps` is the maker's
 * explicit declaration of which capability a case should exercise — the only
 * reliable capability/test link, since schema names never appear in prose.
 */
function caseCommon(c: BotComponent, doc: Record<string, unknown>): Pick<AeTestCase, 'expectedTools' | 'expectedKeywords' | 'source' | 'setId'> {
  const steps = Array.isArray(doc['expectedExecutionSteps'])
    ? (doc['expectedExecutionSteps'] as unknown[])
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s) => ({ kind: str(s['kind']) ?? 'ExpectedToolCallStep', schemaName: str(s['schemaName']) ?? '' }))
      .filter((s) => s.schemaName.length > 0)
    : [];
  const keywords = Array.isArray(doc['expectedKeywords'])
    ? (doc['expectedKeywords'] as unknown[]).map((k) => str(k)).filter((k): k is string => !!k)
    : [];
  return {
    expectedTools: steps.length > 0 ? steps : undefined,
    expectedKeywords: keywords.length > 0 ? keywords : undefined,
    source: typeof doc['source'] === 'string' ? doc['source'] : undefined,
    setId: c.parentbotcomponentid,
  };
}

function mapEvalSet(c: BotComponent, doc: Record<string, unknown>): AeEvaluationSet {
  const graderDetails = Array.isArray(doc['graders'])
    ? (doc['graders'] as unknown[]).map(mapGrader)
    : [];
  return {
    name: c.name, displayName: str(doc['displayName']),
    graders: graderDetails.map((g) => g.kind), graderDetails,
    id: c.botcomponentid, schemaname: c.schemaname,
    componentId: c.botcomponentid, componentIdUnique: c.componentidunique,
  };
}

/**
 * EvaluationData carries its case under `rows[]` as `input` / `expectedOutput`.
 * The legacy `source.input` / `source.expected` shape is still accepted so that
 * older component payloads keep parsing.
 */
function mapTestCase(c: BotComponent, doc: Record<string, unknown>): AeTestCase {
  const rows = Array.isArray(doc['rows']) ? (doc['rows'] as unknown[]) : [];
  const row = rows.find((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
  const legacy = typeof doc['source'] === 'object' && doc['source'] !== null
    ? doc['source'] as Record<string, unknown>
    : undefined;
  const common = caseCommon(c, doc);
  return {
    name: c.name,
    input: str(row?.['input']) ?? str(legacy?.['input']),
    expected: str(row?.['expectedOutput']) ?? str(row?.['expected']) ?? str(legacy?.['expected']),
    schemaname: c.schemaname,
    componentId: c.botcomponentid,
    componentIdUnique: c.componentidunique,
    turns: 1,
    multiTurn: false,
    ...common,
    // EvaluationData carries provenance per row, not at document level.
    source: str(row?.['source']) ?? common.source,
  };
}

interface MultiTurnActivity {
  activity?: { value?: { from?: { role?: string } }; text?: unknown };
}

const activityText = (a: MultiTurnActivity): string =>
  (Array.isArray(a.activity?.text) ? a.activity?.text as unknown[] : [a.activity?.text])
    .map((t) => str(t)).filter(Boolean).join(' ').trim();

/**
 * A MultiTurnEvaluationCase holds the conversation inline under `activities[]`.
 * User turns are the input; agent turns are the expected responses, so a
 * multi-turn case is gradeable even though it has no `expectedOutput` field.
 */
function mapMultiTurnCase(c: BotComponent, doc: Record<string, unknown>): AeTestCase {
  const acts = Array.isArray(doc['activities']) ? doc['activities'] as MultiTurnActivity[] : [];
  const byRole = (role: string) => acts
    .filter((a) => typeof a === 'object' && a !== null && a.activity?.value?.from?.role === role)
    .map(activityText).filter(Boolean);
  const userTurns = byRole('user');
  const agentTurns = byRole('agent');
  return {
    name: c.name,
    input: userTurns.join('\n') || undefined,
    expected: agentTurns.join('\n') || undefined,
    schemaname: c.schemaname,
    componentId: c.botcomponentid,
    componentIdUnique: c.componentidunique,
    turns: userTurns.length,
    multiTurn: true,
    ...caseCommon(c, doc),
  };
}

// Reused by the harness-neutral evaluation reader; legacy parsing still maps one row as before.
export {
  mapEvalSet as parseEvaluationSet,
  mapTestCase as parseEvaluationCase,
  mapMultiTurnCase as parseMultiTurnEvaluationCase,
};

const unknown = (c: BotComponent, kind: string | undefined, warning: string): AeUnknownKind =>
  ({
    schemaname: c.schemaname,
    kind,
    componenttype: c.componenttype,
    warning,
    componentId: c.botcomponentid,
    componentIdUnique: c.componentidunique,
  });

/** Parse a Microsoft Copilot harness bot's configuration + components into the typed model. */
export function parseAgentsExperience(
  configuration: string,
  components: BotComponent[],
  options: { authenticationMode?: number } = {},
): AgentsExperienceModel {
  const model = emptyModel();
  if (Number.isInteger(options.authenticationMode)) model.authenticationMode = options.authenticationMode;
  try {
    const config = JSON.parse(configuration) as { agentSettings?: Record<string, unknown> };
    const s = config.agentSettings ?? {};
    const web = typeof s['web'] === 'object' && s['web'] !== null
      ? s['web'] as Record<string, unknown> : undefined;
    model.agentSettings = {
      instructions: parseInstructions(s['instructions']),
      modelSeries: (s['model'] as { series?: string } | undefined)?.series,
      enableWebSearch: typeof web?.['enableWebSearch'] === 'boolean'
        ? web['enableWebSearch']
        : typeof s['enableWebSearch'] === 'boolean' ? s['enableWebSearch'] : undefined,
      enableMemory: s['enableMemory'] as boolean | undefined,
      raw: s,
    };
  } catch { /* fail-open: empty settings */ }

  for (const comp of components) {
    // Uploaded knowledge files are top-level type-14 components with file
    // metadata but no YAML payload. Type-14 children belong to skill bundles.
    if (String(comp.componenttype) === '14' && !comp.parentbotcomponentid) {
      model.knowledge.push(mapUploadedFileKnowledge(comp));
      continue;
    }

    const src = comp.data || comp.content;
    if (!src) {
      if (String(comp.componenttype) !== '14') {
        model.unknownKinds.push(unknown(comp, undefined, 'Component source was not captured'));
      }
      continue;
    }
    let doc: Record<string, unknown>;
    try {
      doc = load(src) as Record<string, unknown>;
    } catch {
      model.unknownKinds.push(unknown(comp, undefined, 'YAML parse failed'));
      continue;
    }
    const kind = doc?.['kind'] as string | undefined;
    switch (kind) {
      case 'ConnectorTool':
      case 'McpTool':          model.tools.push(mapTool(comp, doc, kind)); break;
      case 'InlineAgentSkill': model.skills.push(mapSkill(comp, doc)); break;
      case 'ConnectedAgentTool': model.connectedAgents.push(mapConnected(comp, doc)); break;
      case 'KnowledgeSourceConfiguration': model.knowledge.push(mapKnowledge(comp, doc)); break;
      case 'EvaluationSet':    model.evaluationSets.push(mapEvalSet(comp, doc)); break;
      case 'EvaluationData':   model.testCases.push(mapTestCase(comp, doc)); break;
      case 'MultiTurnEvaluationCase':
        // Counted as a test case for scoring/coverage, and retained separately
        // so the multi-turn signal and EVL-05 keep working.
        model.testCases.push(mapMultiTurnCase(comp, doc));
        model.multiTurnCases.push({ name: comp.name, schemaname: comp.schemaname });
        break;
      case 'ExternalTriggerConfiguration':
        model.triggers.push({
          name: comp.name,
          kind,
          schemaname: comp.schemaname,
          flowId: str(doc['flowId']),
          componentId: comp.botcomponentid,
          componentIdUnique: comp.componentidunique,
        });
        break;
      case 'IQCapability':     (model.iqCapabilities ??= []).push(mapIqCapability(comp, doc)); break;
      // Not an AeTool: TOL-03 would read its missing authMode as unset.
      case 'WorkflowTool':     (model.workflowTools ??= []).push(mapWorkflowTool(comp, doc)); break;
      case 'AgentHook':        (model.hooks ??= []).push(mapAgentHook(comp, doc)); break;
      case 'AdaptiveDialog':
      case 'TaskDialog':
      case 'AgentDialog':      break; // standard-shaped topics: ignore in the Microsoft Copilot parser
      default:
        // Recognised system kinds (see recognisedSystemKinds) are created by
        // Copilot Studio itself and carry no maker-authored content, so they
        // are inventoried silently rather than reported as unknown.
        if (isRecognisedUnreviewedKind(kind)) break;
        model.unknownKinds.push(unknown(comp, kind, `Unknown kind '${kind ?? 'none'}' — inventoried, not reviewed`));
    }
  }
  return model;
}
