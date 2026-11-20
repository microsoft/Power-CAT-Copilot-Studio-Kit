/**
 * Usage & credits estimation.
 *
 * Ported from the design prototype's `deriveUsageInsights()` and adapted to the
 * production transcript model. This is deliberately a *diagnostic estimate*:
 * reported values come straight from transcript payloads, while estimated
 * credits apply published Copilot Studio rates to detected activity signals.
 */

import type { ProcessedTranscript, ProcessedTurn, StepExecution } from '../contracts/transcript';
import type { OrchestrationEngine } from './transcript/detect-orchestration-engine';
import { guessStepSubtitle } from './step-classification';

/** Published per-event Copilot Studio message rates. */
export const CREDIT_RATES = {
  classic_answer: 1,
  generative_answer: 2,
  agent_action: 5,
  classicAnswer: 1,
  generativeAnswer: 2,
  agentAction: 5,
} as const;

export type Confidence = 'High' | 'Medium' | 'Low' | 'None';

export interface UsageGroup {
  kind: string;
  label: string;
  count: number;
  rate: number;
  credits: number;
  confidence: Confidence;
  evidence: string;
}

export interface UsageUnknown {
  kind: string;
  label: string;
  status: string;
  detail: string;
}

export interface UsageInsights {
  groups: UsageGroup[];
  estimated: number;
  estimateConfidence: Confidence;
  unknowns: UsageUnknown[];
  actualCredits: number;
  directCopilot: number;
  directAiBuilder: number;
  directRecords: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  modelName?: string;
  entries: number;
  steps: number;
}

/** Component types that are billed as agent actions. */
const ACTION_TYPES = new Set([
  'Flow',
  'Tool',
  'Skill',
  'Connected agent',
  'Child agent',
  'MCP server',
  'Connector Action',
  'Code',
]);

const KNOWLEDGE_PATTERN = /universalsearchtool|knowledgesource|knowledge search/i;
const CONTENT_PATTERN = /pdf|docx|document|spreadsheet|xlsx|image|analyz/i;

interface ClassifiedStep {
  exec: StepExecution;
  type: string;
  haystack: string;
}

interface DirectUsageMetrics {
  copilotCredits: number;
  aiBuilderCredits: number;
  records: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function readNumber(record: UnknownRecord | undefined, ...keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function findFirstString(record: UnknownRecord | undefined, ...keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function classify(turns: ProcessedTurn[]): ClassifiedStep[] {
  const out: ClassifiedStep[] = [];
  for (const turn of turns) {
    for (const exec of turn.debugInfo?.stepExecutions ?? []) {
      const type =
        exec.subtitle ||
        guessStepSubtitle(exec.taskDialogId, exec.type, undefined, exec.observation);
      out.push({
        exec,
        type,
        haystack: `${exec.displayName ?? ''} ${exec.taskDialogId ?? ''}`,
      });
    }
  }
  return out;
}

function sumTokens(turns: ProcessedTurn[]) {
  let prompt = 0;
  let completion = 0;
  let total = 0;
  for (const turn of turns) {
    const turnInfo = turn.debugInfo?.tokenInfo;
    if (turnInfo) {
      prompt += turnInfo.promptTokens ?? 0;
      completion += turnInfo.completionTokens ?? 0;
      total += turnInfo.totalTokens ?? 0;
    }
    for (const exec of turn.debugInfo?.stepExecutions ?? []) {
      const info = exec.tokenInfo;
      if (!info) continue;
      prompt += info.promptTokens ?? 0;
      completion += info.completionTokens ?? 0;
      total += info.totalTokens ?? 0;
    }
  }
  return { prompt, completion, total };
}

function readDirectUsageMetrics(transcript: ProcessedTranscript): DirectUsageMetrics {
  const direct = isRecord(transcript)
    ? isRecord(transcript.usageMetrics)
      ? transcript.usageMetrics
      : undefined
    : undefined;

  return {
    copilotCredits:
      readNumber(direct, 'copilotCredits', 'CopilotCredits', 'copilotCredit', 'CopilotCredit') ?? 0,
    aiBuilderCredits:
      readNumber(
        direct,
        'aiBuilderCredits',
        'AIBuilderCredits',
        'aibuilderCredits',
        'AiBuilderCredits',
        'AIBuilderCredit',
      ) ?? 0,
    records: readNumber(direct, 'records', 'Records', 'recordCount', 'RecordCount') ?? 0,
    totalTokens: readNumber(direct, 'totalTokens', 'TotalTokens') ?? 0,
    promptTokens: readNumber(direct, 'promptTokens', 'PromptTokens') ?? 0,
    completionTokens: readNumber(direct, 'completionTokens', 'CompletionTokens') ?? 0,
  };
}

function deriveModelName(transcript: ProcessedTranscript, turns: ProcessedTurn[]): string | undefined {
  const generalInfo = isRecord(transcript.generalInfo) ? transcript.generalInfo : undefined;
  const fromGeneral = findFirstString(generalInfo, 'modelName', 'model');
  if (fromGeneral) return fromGeneral;

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turnModel = turns[i].debugInfo?.tokenInfo?.model;
    if (turnModel) return turnModel;
    const executions = turns[i].debugInfo?.stepExecutions ?? [];
    for (let j = executions.length - 1; j >= 0; j -= 1) {
      const stepModel = executions[j].tokenInfo?.model;
      if (stepModel) return stepModel;
    }
  }

  return undefined;
}

export function deriveUsageInsights(
  transcript: ProcessedTranscript,
  engine: OrchestrationEngine,
  fallbackTotalTokens = 0,
): UsageInsights {
  const turns = transcript.turns;
  const steps = classify(turns);

  const knowledge = steps.filter(
    (s) => s.type === 'Knowledge' || KNOWLEDGE_PATTERN.test(s.haystack),
  );
  const actions = steps.filter((s) => ACTION_TYPES.has(s.type));
  const classicAnswers = engine === 'classic' ? steps.filter((s) => s.type === 'Topic') : [];

  // Generative answers without a knowledge event: a substantive reply is the
  // only available signal, hence the deliberately low confidence.
  const generativeAnswers =
    engine === 'generative'
      ? turns.filter((turn) => {
          if (turn.role !== 'assistant') return false;
          const hasKnowledge = (turn.debugInfo?.stepExecutions ?? []).some((exec) =>
            knowledge.some((k) => k.exec === exec),
          );
          return !hasKnowledge && (turn.content ?? '').trim().length >= 120;
        })
      : [];

  const contentProcessing = steps.filter((s) => CONTENT_PATTERN.test(s.haystack));
  const flowInvocations = steps.filter((s) => s.type === 'Flow');

  const groups: UsageGroup[] = [];
  const add = (
    kind: string,
    label: string,
    count: number,
    rate: number,
    confidence: Confidence,
    evidence: string,
  ) => {
    if (!count) return;
    groups.push({ kind, label, count, rate, credits: count * rate, confidence, evidence });
  };

  add(
    'generative_answer',
    'Knowledge-backed answers',
    knowledge.length,
    CREDIT_RATES.generative_answer,
    'Medium',
    'Knowledge search or grounding activity',
  );
  add(
    'generative_answer_no_search',
    'Generative answers',
    generativeAnswers.length,
    CREDIT_RATES.generative_answer,
    'Low',
    'Substantive reply inferred without a knowledge event',
  );
  add(
    'classic_answer',
    'Classic topic answers',
    classicAnswers.length,
    CREDIT_RATES.classic_answer,
    'Medium',
    'Classic topic activity',
  );
  add(
    'agent_action',
    'Agent actions',
    actions.length,
    CREDIT_RATES.agent_action,
    'Medium',
    'Flow, tool, skill, MCP or agent invocation activity',
  );

  const estimated = groups.reduce((sum, g) => sum + g.credits, 0);
  const confidences = groups.map((g) => g.confidence);
  const estimateConfidence: Confidence = !groups.length
    ? 'None'
    : confidences.includes('Low')
      ? 'Low'
      : 'Medium';

  const direct = readDirectUsageMetrics(transcript);
  const actualCredits = direct.copilotCredits + direct.aiBuilderCredits;
  const tokenTotals = sumTokens(turns);
  const parsedTokens = fallbackTotalTokens || tokenTotals.total;
  const tokens = direct.totalTokens || parsedTokens;
  const promptTokens = direct.promptTokens || tokenTotals.prompt;
  const completionTokens = direct.completionTokens || tokenTotals.completion;

  const plural = (n: number) => (n === 1 ? '' : 's');

  const unknowns: UsageUnknown[] = [
    {
      kind: 'tenant_graph',
      label: 'Tenant Graph grounding',
      status: 'Not detectable',
      detail: 'No reliable runtime field confirms that the 10-credit grounding meter applied.',
    },
    {
      kind: 'agent_flow',
      label: 'Agent flow actions',
      status: flowInvocations.length ? 'Invocation detected' : 'Units unavailable',
      detail: flowInvocations.length
        ? `${flowInvocations.length} flow invocation signal${plural(flowInvocations.length)} found, but internal action counts are not emitted.`
        : 'Transcripts do not provide the internal action count needed for the per-100-actions meter.',
    },
    {
      kind: 'content_processing',
      label: 'Content processing',
      status: contentProcessing.length ? 'Signal detected' : 'Units unavailable',
      detail: contentProcessing.length
        ? `${contentProcessing.length} document/image signal${plural(contentProcessing.length)} found, but chargeable page or image units are unknown.`
        : 'Page and image counts are not reliably emitted, so no one-page assumption is applied.',
    },
    {
      kind: 'ai_tools',
      label: 'AI tool or reasoning surcharge',
      status: direct.totalTokens || parsedTokens ? 'Tokens detected' : 'Model tier unavailable',
      detail:
        'A basic, standard or premium model classification is required before token-based credits can be estimated.',
    },
    {
      kind: 'billing_context',
      label: 'Billing eligibility',
      status: 'Outside transcript',
      detail:
        'User licensing, test mode, BYOM and other no-charge conditions require environment billing context.',
    },
  ];

  return {
    groups,
    estimated,
    estimateConfidence,
    unknowns,
    actualCredits,
    directCopilot: direct.copilotCredits,
    directAiBuilder: direct.aiBuilderCredits,
    directRecords: direct.records,
    tokens,
    promptTokens,
    completionTokens,
    modelName: deriveModelName(transcript, turns),
    entries: steps.length,
    steps: steps.length,
  };
}
